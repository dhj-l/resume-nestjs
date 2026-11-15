import { JwtService } from '@nestjs/jwt';
import { UserThrottlerGuard } from './user-throttler.guard';

/**
 * 全局限流守卫的计数维度（P0-4）
 *
 * 关键点：全局 APP_GUARD 先于路由级 JwtAuthGuard 执行，此时 req.user 还没填充，
 * 因此必须自己验签 JWT 才能按「登录用户」计数；否则同一公司 NAT 后面的所有
 * 用户会挤在同一个 IP 桶里互相误伤。
 */
describe('UserThrottlerGuard.getTracker', () => {
  const jwtService = { verify: jest.fn() };
  const guard = new UserThrottlerGuard(
    [],
    {} as any,
    {} as any,
    jwtService as unknown as JwtService,
  );

  const tracker = (req: Record<string, any>): Promise<string> =>
    (guard as any).getTracker(req);

  beforeEach(() => {
    jwtService.verify.mockReset();
  });

  it('req.user 已填充时按 userId 计数', async () => {
    await expect(
      tracker({ user: { userId: 'u1' }, ip: '1.2.3.4' }),
    ).resolves.toBe('user:u1');
  });

  it('req.user 未填充时通过验签 JWT 拿到 userId（全局守卫先于 JwtAuthGuard）', async () => {
    jwtService.verify.mockReturnValue({ userId: 'u2' });

    await expect(
      tracker({ headers: { authorization: 'Bearer token-2' }, ip: '1.2.3.4' }),
    ).resolves.toBe('user:u2');
    expect(jwtService.verify).toHaveBeenCalledWith('token-2');
  });

  it('不同用户得到不同的桶', async () => {
    jwtService.verify
      .mockReturnValueOnce({ userId: 'u2' })
      .mockReturnValueOnce({ userId: 'u3' });

    const first = await tracker({ headers: { authorization: 'Bearer a' } });
    const second = await tracker({ headers: { authorization: 'Bearer b' } });

    expect(first).not.toBe(second);
  });

  it('token 非法或过期时回退到 IP', async () => {
    jwtService.verify.mockImplementation(() => {
      throw new Error('invalid token');
    });

    await expect(
      tracker({ headers: { authorization: 'Bearer bad' }, ip: '5.6.7.8' }),
    ).resolves.toBe('ip:5.6.7.8');
  });

  it('没有 Authorization 头时按 IP 计数（登录 / 注册 / OAuth 回调）', async () => {
    await expect(tracker({ headers: {}, ip: '5.6.7.8' })).resolves.toBe(
      'ip:5.6.7.8',
    );
  });

  it('缺少 ip 时仍有稳定的兜底键，不会抛错', async () => {
    await expect(tracker({ headers: {} })).resolves.toBe('ip:unknown');
  });

  it('非 Bearer 方案不参与验签', async () => {
    await expect(
      tracker({ headers: { authorization: 'Basic abc' }, ip: '9.9.9.9' }),
    ).resolves.toBe('ip:9.9.9.9');
    expect(jwtService.verify).not.toHaveBeenCalled();
  });
});
