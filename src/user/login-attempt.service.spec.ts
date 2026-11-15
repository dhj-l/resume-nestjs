import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  failureDelayMs,
  isTrustworthyClientIp,
  LOGIN_LOCK_MS,
  LOGIN_MAX_FAILURES,
  LoginAttemptService,
  resolveLoginScope,
} from './login-attempt.service';

/**
 * 登录失败计数与锁定规则（P0-5）
 *
 * 设计要点：
 * - 只有「可信来源 IP」才允许硬锁，锁的粒度是 (邮箱, IP) —— 陌生人无法再锁死
 *   某个真实用户的账号（原实现是账号级、且在验密之前就判断）。
 * - 来源 IP 不可信（回环/缺失，说明没配好代理）时永不硬锁，只按失败次数加一个
 *   很小的延迟，避免 nginx 误配把所有人算成同一个 IP 后「一人锁死全体」。
 */
describe('登录失败计数规则', () => {
  describe('isTrustworthyClientIp', () => {
    it('缺失或空值不可信', () => {
      expect(isTrustworthyClientIp(undefined)).toBe(false);
      expect(isTrustworthyClientIp('')).toBe(false);
    });

    it('回环地址不可信（说明请求来自本机或未配置代理）', () => {
      expect(isTrustworthyClientIp('127.0.0.1')).toBe(false);
      expect(isTrustworthyClientIp('::1')).toBe(false);
      expect(isTrustworthyClientIp('::ffff:127.0.0.1')).toBe(false);
    });

    it('真实来源地址可信（含内网地址，它们是不同的客户端）', () => {
      expect(isTrustworthyClientIp('203.0.113.7')).toBe(true);
      expect(isTrustworthyClientIp('::ffff:203.0.113.7')).toBe(true);
      expect(isTrustworthyClientIp('10.0.0.5')).toBe(true);
    });
  });

  describe('resolveLoginScope', () => {
    it('可信 IP 归到该 IP 自己的桶', () => {
      expect(resolveLoginScope('203.0.113.7')).toBe('ip:203.0.113.7');
    });

    it('不可信来源统一归到 shared 桶', () => {
      expect(resolveLoginScope('127.0.0.1')).toBe('shared');
      expect(resolveLoginScope(undefined)).toBe('shared');
    });
  });

  describe('failureDelayMs', () => {
    it('前两次失败不加延迟，避免正常用户输错就变慢', () => {
      expect(failureDelayMs(1)).toBe(0);
      expect(failureDelayMs(2)).toBe(0);
    });

    it('随失败次数递增但有上限，不会把接口挂死', () => {
      expect(failureDelayMs(3)).toBeGreaterThan(0);
      expect(failureDelayMs(4)).toBeGreaterThan(failureDelayMs(3));
      expect(failureDelayMs(100)).toBeLessThanOrEqual(2000);
    });
  });
});

describe('LoginAttemptService', () => {
  let service: LoginAttemptService;
  let mockModel: any;

  const makeChain = () => ({ exec: jest.fn() }) as any;

  beforeEach(async () => {
    mockModel = {
      findOne: jest.fn(() => makeChain()),
      findOneAndUpdate: jest.fn(() => makeChain()),
      updateOne: jest.fn(() => makeChain()),
      deleteMany: jest.fn(() => makeChain()),
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoginAttemptService,
        { provide: getModelToken('LoginAttempt'), useValue: mockModel },
      ],
    }).compile();

    service = module.get<LoginAttemptService>(LoginAttemptService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('未锁定时不拦截', async () => {
    const chain = makeChain();
    mockModel.findOne.mockReturnValue(chain);
    chain.exec.mockResolvedValue(null);

    await expect(
      service.checkLocked('a@x.com', '203.0.113.7'),
    ).resolves.toEqual({ locked: false, remainingMs: 0 });
  });

  it('锁定未到期时返回剩余时间', async () => {
    const chain = makeChain();
    mockModel.findOne.mockReturnValue(chain);
    chain.exec.mockResolvedValue({
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const result = await service.checkLocked('a@x.com', '203.0.113.7');

    expect(result.locked).toBe(true);
    expect(result.remainingMs).toBeGreaterThan(0);
    expect(result.remainingMs).toBeLessThanOrEqual(60_000);
  });

  it('锁定期已过时不拦截', async () => {
    const chain = makeChain();
    mockModel.findOne.mockReturnValue(chain);
    chain.exec.mockResolvedValue({ lockedUntil: new Date(Date.now() - 1_000) });

    await expect(
      service.checkLocked('a@x.com', '203.0.113.7'),
    ).resolves.toEqual({ locked: false, remainingMs: 0 });
  });

  /** 是否往数据库写过 lockedUntil（不关心具体是哪条写语句） */
  const wroteLock = (): boolean =>
    [
      ...mockModel.findOneAndUpdate.mock.calls,
      ...mockModel.updateOne.mock.calls,
    ].some(
      ([, update]: [unknown, any]) => update?.$set?.lockedUntil instanceof Date,
    );

  it('可信 IP 上达到失败上限后会持久化锁定时间', async () => {
    const chain = makeChain();
    mockModel.findOneAndUpdate.mockReturnValue(chain);
    mockModel.updateOne.mockReturnValue(makeChain());
    chain.exec.mockResolvedValue({
      failures: LOGIN_MAX_FAILURES,
      lockedUntil: new Date(Date.now() + LOGIN_LOCK_MS),
    });

    const result = await service.recordFailure('a@x.com', '203.0.113.7');

    expect(result.locked).toBe(true);
    expect(result.delayMs).toBeGreaterThanOrEqual(0);
    expect(wroteLock()).toBe(true);
  });

  it('不可信来源（shared）即使超过上限也永不硬锁', async () => {
    const chain = makeChain();
    mockModel.findOneAndUpdate.mockReturnValue(chain);
    mockModel.updateOne.mockReturnValue(makeChain());
    chain.exec.mockResolvedValue({
      failures: LOGIN_MAX_FAILURES + 10,
      lockedUntil: undefined,
    });

    const result = await service.recordFailure('a@x.com', '127.0.0.1');

    expect(result.locked).toBe(false);
    expect(wroteLock()).toBe(false);
  });

  it('clear 会清掉该邮箱在所有来源下的失败记录', async () => {
    const chain = makeChain();
    mockModel.deleteMany.mockReturnValue(chain);
    chain.exec.mockResolvedValue({ deletedCount: 2 });

    await service.clear('a@x.com');

    expect(mockModel.deleteMany).toHaveBeenCalledWith({ email: 'a@x.com' });
  });
});
