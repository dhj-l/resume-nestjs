jest.mock('bcrypt');

import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from './user.service';
import { LoginAttemptService } from './login-attempt.service';
import { TokenBlacklistService } from '../auth/token-blacklist.service';

/**
 * 登录保护（P0-5）
 *
 * 修复前的两个问题：
 * 1. 锁定检查在密码比对**之前**，且计数是账号维度 —— 任何人只要知道邮箱，
 *    连发 5 次错误密码就能把该用户锁死 30 分钟。
 * 2. 错误文案可区分「邮箱不存在 / 密码错误 / 该账号是 OAuth 注册」，可枚举账号。
 */
const UNIFIED_MESSAGE = '邮箱或密码错误';
const OAUTH_HINT = '该账户通过第三方平台注册，请使用第三方登录';

describe('UserService.login — 登录保护', () => {
  let service: UserService;
  let mockModel: any;
  let mockAttempts: any;
  let findOneChain: any;

  const userDoc = (overrides: Record<string, unknown> = {}) => ({
    _id: 'u1',
    username: 'alice',
    email: 'alice@example.com',
    password: '$2b$10$storedhash',
    loginAttempts: 0,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });

  const setUser = (doc: unknown) => {
    findOneChain.exec.mockResolvedValue(doc);
  };

  beforeEach(async () => {
    findOneChain = { select: jest.fn(), exec: jest.fn() };
    findOneChain.select.mockReturnValue(findOneChain);

    mockModel = { findOne: jest.fn(() => findOneChain) };

    mockAttempts = {
      checkLocked: jest
        .fn()
        .mockResolvedValue({ locked: false, remainingMs: 0 }),
      recordFailure: jest
        .fn()
        .mockResolvedValue({ failures: 1, locked: false, delayMs: 0 }),
      clear: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getModelToken('User'), useValue: mockModel },
        { provide: JwtService, useValue: { sign: jest.fn(() => 'jwt-token') } },
        {
          provide: TokenBlacklistService,
          useValue: { addToBlacklist: jest.fn() },
        },
        { provide: LoginAttemptService, useValue: mockAttempts },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    (bcrypt.compare as jest.Mock).mockReset();
  });

  it('邮箱不存在与密码错误返回完全相同的文案（防账号枚举）', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    setUser(null);
    const unknownEmail = await service
      .login(
        { email: 'nobody@example.com', password: 'whatever' },
        '203.0.113.7',
      )
      .catch((error: Error) => error.message);

    setUser(userDoc());
    const wrongPassword = await service
      .login({ email: 'alice@example.com', password: 'wrong' }, '203.0.113.7')
      .catch((error: Error) => error.message);

    expect(unknownEmail).toBe(UNIFIED_MESSAGE);
    expect(wrongPassword).toBe(UNIFIED_MESSAGE);
  });

  it('邮箱不存在时也执行一次 bcrypt 比对，抹平响应时序差异', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    setUser(null);

    await service
      .login(
        { email: 'nobody@example.com', password: 'whatever' },
        '203.0.113.7',
      )
      .catch(() => undefined);

    expect(bcrypt.compare).toHaveBeenCalledTimes(1);
  });

  it('OAuth 注册（无密码）账号保留提示文案', async () => {
    setUser(userDoc({ password: undefined }));

    await expect(
      service.login({ email: 'alice@example.com', password: 'whatever' }),
    ).rejects.toThrow(OAUTH_HINT);
  });

  it('密码错误时记录一次失败（用于限速与延迟），且不返回剩余次数提示', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    setUser(userDoc());

    await expect(
      service.login(
        { email: 'alice@example.com', password: 'wrong' },
        '203.0.113.7',
      ),
    ).rejects.toThrow(UNIFIED_MESSAGE);
    expect(mockAttempts.recordFailure).toHaveBeenCalledWith(
      'alice@example.com',
      '203.0.113.7',
    );
  });

  it('已被锁定（可信来源）时直接拒绝，且不做密码比对', async () => {
    mockAttempts.checkLocked.mockResolvedValue({
      locked: true,
      remainingMs: 5 * 60 * 1000,
    });
    setUser(userDoc());

    await expect(
      service.login(
        { email: 'alice@example.com', password: 'whatever' },
        '203.0.113.7',
      ),
    ).rejects.toThrow(/分钟/);
    expect(bcrypt.compare).not.toHaveBeenCalled();
  });

  it('密码正确时登录成功，并清空失败记录、复位历史遗留的锁定字段', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    const user = userDoc({
      loginAttempts: 3,
      lockedUntil: new Date(Date.now() + 600_000),
    });
    setUser(user);

    const result = await service.login(
      { email: 'alice@example.com', password: 'correct' },
      '203.0.113.7',
    );

    expect(result.token).toBe('jwt-token');
    expect(mockAttempts.clear).toHaveBeenCalledWith('alice@example.com');
    expect(user.loginAttempts).toBe(0);
    expect(user.lockedUntil).toBeUndefined();
    expect(user.save).toHaveBeenCalled();
  });

  it('登录成功返回的用户对象已脱敏（不含密码与 OAuth 令牌）', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    setUser(
      userDoc({
        oauthProviders: [
          {
            platform: 'github',
            platformUserId: '42',
            accessToken: 'cipher-access',
            refreshToken: 'cipher-refresh',
            tokenExpiresAt: new Date(),
            nickname: 'Alice',
          },
        ],
      }),
    );

    const result = await service.login({
      email: 'alice@example.com',
      password: 'correct',
    });

    const returned = result.user as unknown as Record<string, any>;
    expect(returned.password).toBeUndefined();
    expect(returned.oauthProviders[0].accessToken).toBeUndefined();
    expect(returned.oauthProviders[0].refreshToken).toBeUndefined();
    expect(returned.oauthProviders[0].nickname).toBe('Alice');
  });

  it('未传 IP 时也能登录（req.ip 缺失的兜底，走 shared 桶）', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    setUser(userDoc());

    const result = await service.login({
      email: 'alice@example.com',
      password: 'correct',
    });

    expect(result.token).toBe('jwt-token');
  });
});
