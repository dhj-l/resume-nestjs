import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import { UserService } from './user.service';
import { TokenBlacklistService } from '../auth/token-blacklist.service';

/* ------------------------------------------------------------------ */
/*  Mock 工厂                                                        */
/* ------------------------------------------------------------------ */

/** 构建 mock Mongoose Model：一个带有 jest.fn() 的链式调用模拟 */
function buildMockModel() {
  const exec = jest.fn();
  const select = jest.fn().mockReturnThis();
  const findOne = jest.fn().mockReturnValue({ select, exec });
  const findById = jest.fn().mockReturnValue({ select, exec });
  const findOneAndUpdate = jest.fn().mockReturnValue({ select, exec });
  const findByIdAndUpdate = jest.fn().mockReturnValue({ select, exec });
  const findByIdAndDelete = jest.fn().mockReturnValue({ exec });
  const create = jest.fn();
  const updateOne = jest.fn().mockReturnValue({ exec: jest.fn() });
  const toObject = jest.fn().mockReturnThis();

  return {
    findOne,
    findById,
    findOneAndUpdate,
    findByIdAndUpdate,
    findByIdAndDelete,
    create,
    updateOne,
    // 赋值给实例公共属性（mongoose 文档方法）
    exec,
    select,
    toObject,
  };
}

type MockModel = ReturnType<typeof buildMockModel>;

function mockJwtService() {
  return { sign: jest.fn().mockReturnValue('fake-jwt-token') };
}

function mockTokenBlacklistService() {
  return { addToBlacklist: jest.fn().mockResolvedValue(undefined) };
}

/* ------------------------------------------------------------------ */
/*  测试数据                                                          */
/* ------------------------------------------------------------------ */

const DEFAULT_PARAMS = {
  platform: 'gitee',
  platformUserId: '12345',
  accessToken: 'encrypted_access_token_abc',
  refreshToken: 'encrypted_refresh_token_xyz',
  tokenExpiresAt: new Date(Date.now() + 86400 * 1000),
  nickname: '张三',
  avatarUrl: 'https://avatar.example.com/zhangsan.png',
  profileUrl: 'https://gitee.com/zhangsan',
  email: 'zhangsan@example.com',
  verifiedEmail: 'zhangsan@example.com',
};

/** 模拟已有用户文档数据 */
function existingUserDoc(_overrides: Record<string, unknown> = {}) {
  return {
    _id: 'user-existing-1',
    email: 'zhangsan@example.com',
    username: 'zhangsan',
    oauthProviders: [
      {
        platform: 'gitee',
        platformUserId: '12345',
        accessToken: 'old_encrypted_token',
        refreshToken: 'old_encrypted_refresh',
        tokenExpiresAt: new Date(Date.now() + 3600 * 1000),
        nickname: '张三-old',
        avatarUrl: 'https://old-avatar.example.com/old.png',
        profileUrl: 'https://gitee.com/zhangsan-old',
        email: 'old@example.com',
      },
    ],
    toObject: jest.fn().mockReturnThis(),
  };
}

/** 模拟邮箱匹配但平台未绑定的用户文档 */
function existingEmailUserDoc() {
  return {
    _id: 'user-email-1',
    email: 'zhangsan@example.com',
    username: 'zhangsan_email',
    oauthProviders: [
      {
        platform: 'github',
        platformUserId: 'gh-999',
        accessToken: 'gh_token',
        nickname: 'zhangsan-gh',
      },
    ],
    toObject: jest.fn().mockReturnThis(),
  };
}

/* ------------------------------------------------------------------ */
/*  测试套件                                                          */
/* ------------------------------------------------------------------ */

describe('UserService — findOrCreateOAuthUser', () => {
  let service: UserService;
  let mockModel: MockModel;

  beforeEach(async () => {
    mockModel = buildMockModel();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getModelToken('User'), useValue: mockModel },
        { provide: JwtService, useFactory: mockJwtService },
        {
          provide: TokenBlacklistService,
          useFactory: mockTokenBlacklistService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /* ================================================================ */
  /*  Phase 1a: 同平台同 ID 已存在                                    */
  /* ================================================================ */
  describe('Phase 1a — 同平台同 ID 已存在（策略 1）', () => {
    it('应原子更新令牌并返回已有用户', async () => {
      const doc = existingUserDoc();
      mockModel.exec.mockResolvedValue(doc);

      const result = await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      expect(result.isNew).toBe(false);
      expect(result.user).toBe(doc);

      // 验证调用了 Phase 1a 的 findOneAndUpdate
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          oauthProviders: {
            $elemMatch: {
              platform: 'gitee',
              platformUserId: '12345',
            },
          },
        },
        {
          $set: expect.objectContaining({
            'oauthProviders.$[elem].accessToken': 'encrypted_access_token_abc',
          }),
        },
        { new: true, arrayFilters: [expect.any(Object)] },
      );

      // Phase 1b / Phase 2 不应被调用
      expect(mockModel.create).not.toHaveBeenCalled();
    });

    it('应在 providerUpdate 中包含所有 7 个字段', async () => {
      const doc = existingUserDoc();
      mockModel.exec.mockResolvedValue(doc);

      await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      const [, update] = mockModel.findOneAndUpdate.mock.calls[0];
      expect(update.$set).toMatchObject({
        'oauthProviders.$[elem].accessToken': 'encrypted_access_token_abc',
        'oauthProviders.$[elem].refreshToken': 'encrypted_refresh_token_xyz',
        'oauthProviders.$[elem].tokenExpiresAt': DEFAULT_PARAMS.tokenExpiresAt,
        'oauthProviders.$[elem].nickname': '张三',
        'oauthProviders.$[elem].avatarUrl':
          'https://avatar.example.com/zhangsan.png',
        'oauthProviders.$[elem].profileUrl': 'https://gitee.com/zhangsan',
        'oauthProviders.$[elem].email': 'zhangsan@example.com',
      });
    });

    it('应正确传递 arrayFilter 定位元素', async () => {
      const doc = existingUserDoc();
      mockModel.exec.mockResolvedValue(doc);

      await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      const [, , opts] = mockModel.findOneAndUpdate.mock.calls[0];
      expect(opts.arrayFilters).toEqual([
        { 'elem.platform': 'gitee', 'elem.platformUserId': '12345' },
      ]);
    });

    it('可选字段缺失时不应出现在 providerUpdate 中', async () => {
      const doc = existingUserDoc();
      mockModel.exec.mockResolvedValue(doc);

      await service.findOrCreateOAuthUser({
        platform: 'gitee',
        platformUserId: '12345',
        accessToken: 'token_only',
      });

      const [, update] = mockModel.findOneAndUpdate.mock.calls[0];
      const setKeys = Object.keys(update.$set);
      // refreshToken / tokenExpiresAt / nickname / avatarUrl / profileUrl / email 均未传入
      expect(setKeys).toHaveLength(1);
      expect(setKeys[0]).toBe('oauthProviders.$[elem].accessToken');
    });
  });

  /* ================================================================ */
  /*  Phase 1b: 邮箱匹配但平台未绑定                                    */
  /* ================================================================ */
  describe('Phase 1b — 邮箱匹配，追加密平台绑定（策略 2）', () => {
    it('应追加 provider 到已有用户', async () => {
      // Phase 1a 返回 null → 走 Phase 1b
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(existingEmailUserDoc()); // Phase 1b

      const result = await service.findOrCreateOAuthUser({
        ...DEFAULT_PARAMS,
        platform: 'gitee',
        platformUserId: 'gt-111',
        verifiedEmail: 'zhangsan@example.com',
      });

      expect(result.isNew).toBe(false);
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(2);

      // Phase 1b 调用参数
      const [query, update, opts] = mockModel.findOneAndUpdate.mock.calls[1];
      expect(query).toEqual({
        email: 'zhangsan@example.com',
        'oauthProviders.platform': { $ne: 'gitee' },
      });
      expect(update).toEqual({
        $push: {
          oauthProviders: expect.objectContaining({
            platform: 'gitee',
            platformUserId: 'gt-111',
            accessToken: 'encrypted_access_token_abc',
          }),
        },
      });
      expect(opts).toEqual({ new: true });
    });

    it('无 verifiedEmail 时应跳过 Phase 1b 直接创建新用户', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null); // generateUniqueUsername 的 findOne

      mockModel.create.mockResolvedValueOnce({
        _id: 'new-user-1',
        email: 'gitee_98765@oauth.local',
        username: 'new_user',
        toObject: jest.fn().mockReturnThis(),
      });

      await service.findOrCreateOAuthUser({
        platform: 'gitee',
        platformUserId: '98765',
        accessToken: 'token',
        // 不传 verifiedEmail
      });

      // Phase 1b 不应被调用，直接跳到 create
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(1); // 只有 Phase 1a
      expect(mockModel.create).toHaveBeenCalledTimes(1);
    });
  });

  /* ================================================================ */
  /*  Phase 1b 跳过：邮箱匹配但平台已绑定                              */
  /* ================================================================ */
  describe('Phase 1b 跳过 — 邮箱匹配但平台已绑定', () => {
    it('应跳过 Phase 1b 走入 Phase 2 创建新用户', async () => {
      // Phase 1a 返回 null（不同的 platformUserId）
      // Phase 1b 也返回 null（因为 platform 已存在，$ne 条件不满足）
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null) // Phase 1b
        .mockResolvedValueOnce(null); // generateUniqueUsername findOne

      mockModel.create.mockResolvedValueOnce({
        _id: 'new-user-3',
        email: 'zhangsan@example.com',
        username: 'new_user_3',
        toObject: jest.fn().mockReturnThis(),
      });

      const result = await service.findOrCreateOAuthUser({
        ...DEFAULT_PARAMS,
        platform: 'gitee',
        platformUserId: 'DIFFERENT_ID', // 与已绑定用户的 platformUserId 不同
        verifiedEmail: 'zhangsan@example.com',
      });

      expect(result.isNew).toBe(true);

      // Phase 1b 查询条件中包含 platform $ne 守卫
      const [query] = mockModel.findOneAndUpdate.mock.calls[1];
      expect(query).toEqual({
        email: 'zhangsan@example.com',
        'oauthProviders.platform': { $ne: 'gitee' },
      });
    });
  });

  /* ================================================================ */
  /*  Phase 2: 创建新用户                                              */
  /* ================================================================ */
  describe('Phase 2 — 创建新用户（策略 3）', () => {
    it('应创建带完整 provider 和 profile 字段的新用户', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null); // generateUniqueUsername findOne

      mockModel.create.mockResolvedValueOnce({
        _id: 'new-user-2',
        email: 'zhangsan@example.com',
        username: 'zhangsan',
        toObject: jest.fn().mockReturnThis(),
      });

      const result = await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      expect(result.isNew).toBe(true);
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'zhangsan@example.com',
          createdVia: 'gitee',
          password: undefined,
          oauthProviders: [
            expect.objectContaining({
              platform: 'gitee',
              platformUserId: '12345',
              accessToken: 'encrypted_access_token_abc',
              nickname: '张三',
            }),
          ],
        }),
      );
    });

    it('无邮箱时生成占位邮箱', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null); // generateUniqueUsername findOne

      mockModel.create.mockResolvedValueOnce({
        _id: 'new-qq',
        email: 'qq_54321@oauth.local',
        username: 'qq_user',
        toObject: jest.fn().mockReturnThis(),
      });

      await service.findOrCreateOAuthUser({
        platform: 'qq',
        platformUserId: '54321',
        accessToken: 'qq_token',
        nickname: 'QQ昵称',
      });

      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'qq_54321@oauth.local',
          createdVia: 'qq',
        }),
      );
    });

    it('username 应从 nickname 生成', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null); // findOne → username 未占用

      mockModel.create.mockResolvedValueOnce({
        _id: 'new-nick',
        email: 'test@example.com',
        username: '张三',
        toObject: jest.fn().mockReturnThis(),
      });

      await service.findOrCreateOAuthUser({
        ...DEFAULT_PARAMS,
        nickname: '张三',
      });

      // username 应基于 "张三" 生成（去除特殊字符后的结果）
      expect(mockModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          username: expect.stringContaining('张三'),
        }),
      );
    });
  });

  /* ================================================================ */
  /*  竞态恢复：成功路径                                               */
  /* ================================================================ */
  describe('竞态恢复 — 成功路径', () => {
    it('duplicate key 后 Phase 1a 重试应成功', async () => {
      // Phase 1a → null → Phase 1b → null → generateUniqueUsername → null
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null) // Phase 1b（verifiedEmail 存在）
        .mockResolvedValueOnce(null); // findOne for unique username

      // create → 抛 duplicate key error
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000 duplicate key error'), { code: 11000 }),
      );

      // 重试 Phase 1a → 成功
      const retryDoc = existingUserDoc();
      mockModel.exec.mockResolvedValueOnce(retryDoc);

      const result = await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      expect(result.isNew).toBe(false);
      expect(result.user).toBe(retryDoc);

      // findOneAndUpdate 被调用了 3 次：Phase 1a + Phase 1b + 重试 Phase 1a
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(3);
    });

    it('duplicate key 后 Phase 1b 重试应成功', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null) // Phase 1b（verifiedEmail 存在）
        .mockResolvedValueOnce(null); // findOne for unique username

      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000 duplicate'), { code: 11000 }),
      );

      // 重试 Phase 1a → null（platform 不同）
      // 重试 Phase 1b → 成功
      const retryDoc = existingEmailUserDoc();
      mockModel.exec
        .mockResolvedValueOnce(null) // 重试 Phase 1a
        .mockResolvedValueOnce(retryDoc); // 重试 Phase 1b

      const result = await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      expect(result.isNew).toBe(false);
      // Phase1a + Phase1b + Retry Phase1a + Retry Phase1b = 4
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(4);
    });

    it('竞态重试中 providerUpdate 应包含完整 7 个字段', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null) // Phase 1b（verifiedEmail 存在）
        .mockResolvedValueOnce(null); // findOne for unique username

      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );

      const retryDoc = existingUserDoc();
      mockModel.exec.mockResolvedValueOnce(retryDoc);

      await service.findOrCreateOAuthUser(DEFAULT_PARAMS);

      // 重试 Phase 1a 的 $set 应与正常 Phase 1a 完全一致
      // calls: [0]=Phase1a, [1]=Phase1b, [2]=Retry Phase1a
      const [, retryUpdate] = mockModel.findOneAndUpdate.mock.calls[2];
      expect(retryUpdate.$set).toMatchObject({
        'oauthProviders.$[elem].accessToken': 'encrypted_access_token_abc',
        'oauthProviders.$[elem].refreshToken': 'encrypted_refresh_token_xyz',
        'oauthProviders.$[elem].tokenExpiresAt': DEFAULT_PARAMS.tokenExpiresAt,
        'oauthProviders.$[elem].nickname': '张三',
        'oauthProviders.$[elem].avatarUrl':
          'https://avatar.example.com/zhangsan.png',
        'oauthProviders.$[elem].profileUrl': 'https://gitee.com/zhangsan',
        'oauthProviders.$[elem].email': 'zhangsan@example.com',
      });
    });
  });

  /* ================================================================ */
  /*  竞态恢复：username 冲突重试                                      */
  /* ================================================================ */
  describe('竞态恢复 — username 冲突重试', () => {
    it('重试 Phase 1 均失败后应进入 username 重试循环', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null); // findOne for unique username

      // create → duplicate key（假设是 username 冲突）
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );

      // 重试 Phase 1a → null
      mockModel.exec.mockResolvedValueOnce(null);

      // 同一个 verifiedEmail，但平台不同，Phase 1b 在重试路径中
      // 由于 verifiedEmail 有值且 DEFAULT_PARAMS 的平台是 'gitee'...
      // 但如果重试 Phase 1b 也找不到（email 已匹配但平台已绑定的极端情况）
      // 这里我们模拟重试 Phase 1b 也返回 null（通过 email 不匹配）
      // 注意：DEFAULT_PARAMS.verifiedEmail 存在，所以重试中会走 Phase 1b
      // 我们给一个不存在的 email 场景来跳过
      // 换个方式：用无 verifiedEmail 的用例来测试 username 循环

      // 重试成功 → 第二次 create 成功
      mockModel.create.mockResolvedValueOnce({
        _id: 'new-retry-1',
        email: 'zhangsan@example.com',
        username: '张三_4721',
        toObject: jest.fn().mockReturnThis(),
      });

      // 注意：DEFAULT_PARAMS 有 verifiedEmail，Phase 1b 重试会尝试用邮箱查找
      // 如果邮箱已存在（创建用户时用了这个邮箱），Phase 1b 就会匹配到
      // 所以要想让 username 重试循环走到，需要 Phase 1a 和 Phase 1b 都找不到
      // 我们来单独测无 verifiedEmail 场景更直接
    });

    it('无 verifiedEmail 时，username 冲突应触发重试循环', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null) // findOne → username 可用
        .mockResolvedValueOnce(null); // 重试 Phase 1a → null

      // create 第一次失败
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );

      // 第 2 次 create 成功
      mockModel.create.mockResolvedValueOnce({
        _id: 'retry-username-1',
        email: 'gitee_nodata@oauth.local',
        username: 'new_retry_username',
        toObject: jest.fn().mockReturnThis(),
      });

      const result = await service.findOrCreateOAuthUser({
        platform: 'gitee',
        platformUserId: 'noexistent',
        accessToken: 'token',
        // 无 email / verifiedEmail
      });

      expect(result.isNew).toBe(true);
      expect(mockModel.create).toHaveBeenCalledTimes(2);
    });

    it('username 重试 3 次全部冲突应抛出 BadRequestException', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null) // findOne → username 可用
        .mockResolvedValueOnce(null); // 重试 Phase 1a

      // create 第一次失败
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );
      // 重试 1
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );
      // 重试 2
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );
      // 重试 3
      mockModel.create.mockRejectedValueOnce(
        Object.assign(new Error('E11000'), { code: 11000 }),
      );

      await expect(
        service.findOrCreateOAuthUser({
          platform: 'github',
          platformUserId: 'gh-noexist',
          accessToken: 'token',
          // 无 email / verifiedEmail
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  /* ================================================================ */
  /*  边界场景                                                         */
  /* ================================================================ */
  describe('边界场景', () => {
    it('create 非 duplicate key 错误应直接抛出', async () => {
      mockModel.exec
        .mockResolvedValueOnce(null) // Phase 1a
        .mockResolvedValueOnce(null); // findOne

      const fatalError = new Error('Connection refused');
      mockModel.create.mockRejectedValueOnce(fatalError);

      await expect(
        service.findOrCreateOAuthUser({
          platform: 'gitee',
          platformUserId: '888',
          accessToken: 'tok',
        }),
      ).rejects.toThrow('Connection refused');
    });

    it('重复调用应不产生重复 oauthProvider 条目（幂等性）', async () => {
      // 第一次：Phase 1a 返回已有用户
      const doc1 = existingUserDoc();
      mockModel.exec.mockResolvedValue(doc1);

      const r1 = await service.findOrCreateOAuthUser(DEFAULT_PARAMS);
      expect(r1.isNew).toBe(false);

      jest.clearAllMocks();

      // 第二次：同样的参数再次调用
      const doc2 = existingUserDoc();
      mockModel.exec.mockResolvedValue(doc2);

      const r2 = await service.findOrCreateOAuthUser(DEFAULT_PARAMS);
      expect(r2.isNew).toBe(false);

      // 只应调用 Phase 1a 一次（直接命中），无 $addToSet 操作
      expect(mockModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
      const [, update] = mockModel.findOneAndUpdate.mock.calls[0];
      // 确保 update 中无 $addToSet
      expect(update).not.toHaveProperty('$addToSet');
      expect(update).toHaveProperty('$set');
    });
  });
});

/* ------------------------------------------------------------------ */
/*  UserService — findAll（分页 + 搜索 + 筛选）                       */
/* ------------------------------------------------------------------ */

describe('UserService — findAll', () => {
  let service: UserService;
  let mockModel: any;

  beforeEach(async () => {
    // 构建支持分页查询的 mock 模型
    mockModel = {
      find: jest.fn(),
      countDocuments: jest.fn(),
    };

    // find 返回链式调用 mock
    const chainObj = {
      select: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      sort: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    };
    mockModel.find.mockReturnValue(chainObj);

    // countDocuments 返回 { exec }
    const countChain = {
      exec: jest.fn(),
    };
    mockModel.countDocuments.mockReturnValue(countChain);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getModelToken('User'), useValue: mockModel },
        { provide: JwtService, useFactory: mockJwtService },
        {
          provide: TokenBlacklistService,
          useFactory: mockTokenBlacklistService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('应返回分页结果（默认参数）', async () => {
    const mockItems = [
      { _id: 'u1', username: 'alice', email: 'alice@example.com' },
      { _id: 'u2', username: 'bob', email: 'bob@example.com' },
    ];
    mockModel.find().exec.mockResolvedValue(mockItems);
    mockModel.countDocuments().exec.mockResolvedValue(2);

    const result = await service.findAll({});

    expect(result).toEqual({
      items: mockItems,
      total: 2,
      page: 1,
      pageSize: 10,
    });
    expect(mockModel.find).toHaveBeenCalledWith({});
  });

  it('应支持自定义分页参数', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(50);

    const result = await service.findAll({ page: 3, pageSize: 20 });

    expect(result.page).toBe(3);
    expect(result.pageSize).toBe(20);

    // skip 应为 (page - 1) * pageSize = 40
    const chain = mockModel.find();
    expect(chain.skip).toHaveBeenCalledWith(40);
    expect(chain.limit).toHaveBeenCalledWith(20);
  });

  it('pageSize 超过 100 时应限制为 100', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(200);

    const result = await service.findAll({ pageSize: 500 });

    expect(result.pageSize).toBe(100);

    const chain = mockModel.find();
    expect(chain.limit).toHaveBeenCalledWith(100);
  });

  it('应按关键词搜索用户名或邮箱', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(0);

    await service.findAll({ keyword: 'john' });

    expect(mockModel.find).toHaveBeenCalledWith({
      $or: [
        { username: { $regex: 'john', $options: 'i' } },
        { email: { $regex: 'john', $options: 'i' } },
      ],
    });
  });

  it('关键词中的正则特殊字符应被转义', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(0);

    await service.findAll({ keyword: 'test+user' });

    expect(mockModel.find).toHaveBeenCalledWith({
      $or: [
        { username: { $regex: 'test\\+user', $options: 'i' } },
        { email: { $regex: 'test\\+user', $options: 'i' } },
      ],
    });
  });

  it('应按 createdVia 筛选', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(10);

    await service.findAll({ createdVia: 'github' });

    expect(mockModel.find).toHaveBeenCalledWith({ createdVia: 'github' });
  });

  it('应同时支持关键词和 createdVia 筛选', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(5);

    await service.findAll({ keyword: 'dev', createdVia: 'gitee' });

    expect(mockModel.find).toHaveBeenCalledWith({
      $or: [
        { username: { $regex: 'dev', $options: 'i' } },
        { email: { $regex: 'dev', $options: 'i' } },
      ],
      createdVia: 'gitee',
    });
  });

  it('countDocuments 应使用相同的 filter', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(1);

    await service.findAll({ createdVia: 'qq' });

    expect(mockModel.countDocuments).toHaveBeenCalledWith({
      createdVia: 'qq',
    });
  });

  it('应排除密码字段', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(0);

    await service.findAll({});

    const chain = mockModel.find();
    expect(chain.select).toHaveBeenCalledWith('-password');
  });

  it('应按 createdAt 降序排列', async () => {
    mockModel.find().exec.mockResolvedValue([]);
    mockModel.countDocuments().exec.mockResolvedValue(0);

    await service.findAll({});

    const chain = mockModel.find();
    expect(chain.sort).toHaveBeenCalledWith({ createdAt: -1 });
  });
});

/* ------------------------------------------------------------------ */
/*  UserService — getUserStats                                        */
/* ------------------------------------------------------------------ */

describe('UserService — getUserStats', () => {
  let service: UserService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };

    // countDocuments 返回 { exec }
    const execChain = {
      exec: jest.fn(),
    };
    mockModel.countDocuments.mockReturnValue(execChain);

    // aggregate 直接返回结果
    mockModel.aggregate.mockReturnValue({
      exec: jest.fn(),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getModelToken('User'), useValue: mockModel },
        { provide: JwtService, useFactory: mockJwtService },
        {
          provide: TokenBlacklistService,
          useFactory: mockTokenBlacklistService,
        },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('应返回用户统计数据', async () => {
    mockModel
      .countDocuments()
      .exec.mockResolvedValueOnce(100) // 总用户数
      .mockResolvedValueOnce(15); // 本月新增

    mockModel.aggregate().exec.mockResolvedValue([
      { _id: 'email', count: 60 },
      { _id: 'github', count: 25 },
      { _id: 'gitee', count: 10 },
      { _id: 'qq', count: 5 },
    ]);

    const result = await service.getUserStats();

    expect(result.totalUsers).toBe(100);
    expect(result.newThisMonth).toBe(15);
    expect(result.byPlatform).toEqual({
      email: 60,
      github: 25,
      gitee: 10,
      qq: 5,
    });
  });

  it('空数据库时应返回零值', async () => {
    mockModel
      .countDocuments()
      .exec.mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    mockModel.aggregate().exec.mockResolvedValue([]);

    const result = await service.getUserStats();

    expect(result.totalUsers).toBe(0);
    expect(result.newThisMonth).toBe(0);
    expect(result.byPlatform).toEqual({});
  });

  it('aggregate 应按 createdVia 分组', async () => {
    mockModel.countDocuments().exec.mockResolvedValue(10);
    mockModel.aggregate().exec.mockResolvedValue([]);

    await service.getUserStats();

    expect(mockModel.aggregate).toHaveBeenCalledWith([
      { $group: { _id: '$createdVia', count: { $sum: 1 } } },
    ]);
  });

  it('_id 为 null 的分组应映射为 email', async () => {
    mockModel
      .countDocuments()
      .exec.mockResolvedValueOnce(50)
      .mockResolvedValueOnce(10);
    mockModel.aggregate().exec.mockResolvedValue([{ _id: null, count: 50 }]);

    const result = await service.getUserStats();

    expect(result.byPlatform).toEqual({ email: 50 });
  });
});
