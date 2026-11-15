import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminGuard, parseAdminEmails } from './admin.guard';

/**
 * 管理员鉴权守卫（P0-2）
 *
 * 管理员身份来源：环境变量 ADMIN_EMAILS（逗号分隔）。
 * 未配置 → 一律 403（fail closed），避免漏配导致管理端裸奔。
 */
function contextFor(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function configWith(adminEmails: string | undefined): ConfigService {
  return {
    get: jest.fn().mockReturnValue(adminEmails),
  } as unknown as ConfigService;
}

describe('AdminGuard', () => {
  describe('ADMIN_EMAILS 解析', () => {
    it('按逗号切分并 trim、转小写、去空、去重', () => {
      expect(parseAdminEmails(' a@x.com, B@X.com ,, a@x.com ')).toEqual([
        'a@x.com',
        'b@x.com',
      ]);
    });

    it('未配置或空串时返回空数组', () => {
      expect(parseAdminEmails(undefined)).toEqual([]);
      expect(parseAdminEmails('')).toEqual([]);
      expect(parseAdminEmails('   ,  ,')).toEqual([]);
    });
  });

  describe('canActivate', () => {
    it('白名单内的邮箱允许通过（大小写与空格不敏感）', () => {
      const guard = new AdminGuard(configWith(' a@x.com, B@X.com ,'));

      expect(guard.canActivate(contextFor({ email: 'a@x.com' }))).toBe(true);
      expect(guard.canActivate(contextFor({ email: 'b@x.com' }))).toBe(true);
      expect(guard.canActivate(contextFor({ email: 'B@x.com' }))).toBe(true);
    });

    it('不在白名单内的登录用户被拒绝', () => {
      const guard = new AdminGuard(configWith('a@x.com'));

      expect(() => guard.canActivate(contextFor({ email: 'c@x.com' }))).toThrow(
        ForbiddenException,
      );
    });

    it('未配置 ADMIN_EMAILS 时任何人都被拒绝（fail closed）', () => {
      const guard = new AdminGuard(configWith(undefined));

      expect(() => guard.canActivate(contextFor({ email: 'a@x.com' }))).toThrow(
        ForbiddenException,
      );
    });

    it('ADMIN_EMAILS 为空白字符串时同样拒绝', () => {
      const guard = new AdminGuard(configWith('   '));

      expect(() => guard.canActivate(contextFor({ email: 'a@x.com' }))).toThrow(
        ForbiddenException,
      );
    });

    it('请求上没有用户信息时被拒绝（未经过 JwtAuthGuard）', () => {
      const guard = new AdminGuard(configWith('a@x.com'));

      expect(() => guard.canActivate(contextFor(undefined))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(contextFor({}))).toThrow(
        ForbiddenException,
      );
      expect(() => guard.canActivate(contextFor({ email: 123 }))).toThrow(
        ForbiddenException,
      );
    });
  });
});
