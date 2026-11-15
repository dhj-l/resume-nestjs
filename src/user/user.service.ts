import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserDocument } from './entities/user.entity';
import { LoginDto } from './dto/login-dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { sanitizeOAuthUser } from '../common/oauth/sanitize-user.util';
import { TokenBlacklistService } from '../auth/token-blacklist.service';
import { QueryUserDto } from './dto/query-user.dto';
import { LoginAttemptService } from './login-attempt.service';

/**
 * 登录失败的统一文案（P0-5）
 *
 * 「邮箱不存在」与「密码错误」必须完全一致，否则可以枚举出哪些邮箱已注册。
 */
export const LOGIN_FAILED_MESSAGE = '邮箱或密码错误';

/**
 * 用于「邮箱不存在」时抹平响应耗时的比对目标（不是任何真实账号的密码）
 */
const DUMMY_PASSWORD_HASH =
  '$2b$10$pc5ichA4y.aIKOTsp5NSIetpFb/dUopIwUpuKS3DAT02jI9qECSpm';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private tokenBlacklistService: TokenBlacklistService,
    private loginAttemptService: LoginAttemptService,
  ) {}

  /**
   * 把用户文档转成「可安全返回给客户端」的形状（P0-3）
   *
   * 复用 OAuth 回调既有的脱敏工具：剥离 password 与
   * oauthProviders[].accessToken / refreshToken / tokenExpiresAt，
   * 但保留 platform / platformUserId / nickname / avatarUrl / profileUrl，
   * 以免打断前端「账号绑定」页的展示。
   *
   * 返回类型刻意保持 User，使所有调用方与既有类型契约不变。
   */
  private toSafeUser(user: unknown): User {
    return sanitizeOAuthUser(
      user as Record<string, unknown>,
    ) as unknown as User;
  }

  /**
   * 创建新用户
   * @param createUserDto 用户创建 DTO,包含用户名、密码和邮箱
   * @returns 创建的用户对象(不包含密码)
   * @throws ConflictException 当用户名或邮箱已存在时抛出
   */
  async create(createUserDto: CreateUserDto): Promise<User> {
    try {
      this.logger.log(`尝试创建用户: ${createUserDto.email}`);

      const existingUser = await this.userModel.findOne({
        $or: [
          { email: createUserDto.email },
          { username: createUserDto.username },
        ],
      });

      if (existingUser) {
        this.logger.warn(
          `用户已存在: ${createUserDto.email} 或 ${createUserDto.username}`,
        );
        throw new ConflictException('Username or email already exists');
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
      const createdUser = await this.userModel.create({
        ...createUserDto,
        password: hashedPassword,
      });

      this.logger.log(`用户创建成功: ${createdUser.email}`);
      return this.toSafeUser(createdUser);
    } catch (error) {
      this.logger.error(
        `创建用户失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 用户登录（P0-5）
   *
   * 安全语义：
   * - 锁的粒度是 (邮箱, 来源 IP)，且只在来源可信时生效 —— 陌生人无法再锁死
   *   真实用户的账号；
   * - 「邮箱不存在」与「密码错误」返回完全一致的文案，并对不存在的邮箱也跑一次
   *   bcrypt 比对，抹平时序差异，避免账号枚举；
   * - 登录成功即清空该邮箱的失败记录，并复位历史遗留的账号级锁定字段。
   *
   * @param loginDto 登录 DTO，包含邮箱和密码
   * @param clientIp 客户端 IP（未配置 TRUST_PROXY 时即 socket 地址）
   * @returns 包含 JWT token 和用户信息的对象
   * @throws BadRequestException 当凭据错误、该来源被暂时锁定或账号为 OAuth 注册时抛出
   */
  async login(loginDto: LoginDto, clientIp?: string) {
    try {
      this.logger.log(`用户尝试登录: ${loginDto.email}`);

      const { email, password } = loginDto;

      const lockStatus = await this.loginAttemptService.checkLocked(
        email,
        clientIp,
      );
      if (lockStatus.locked) {
        const remainingMinutes = Math.max(
          1,
          Math.ceil(lockStatus.remainingMs / 60000),
        );
        this.logger.warn(
          `登录被拒: 该来源失败次数过多 - ${email}, 剩余 ${remainingMinutes} 分钟`,
        );
        throw new BadRequestException(
          `登录失败次数过多，请 ${remainingMinutes} 分钟后再试`,
        );
      }

      const user = await this.userModel.findOne({ email }).exec();
      if (!user) {
        // 统一文案 + 等价耗时，避免把「邮箱是否注册」暴露出去
        await this.consumeDummyCompare(password);
        await this.recordLoginFailure(email, clientIp);
        throw new BadRequestException(LOGIN_FAILED_MESSAGE);
      }

      // OAuth 注册用户未设置密码，无法通过邮箱+密码方式登录
      if (!user.password) {
        this.logger.warn(`登录失败: 该账户未设置密码（OAuth注册） - ${email}`);
        throw new BadRequestException(
          '该账户通过第三方平台注册，请使用第三方登录',
        );
      }

      const passwordMatch = await bcrypt.compare(password, user.password);
      if (!passwordMatch) {
        await this.recordLoginFailure(email, clientIp);
        throw new BadRequestException(LOGIN_FAILED_MESSAGE);
      }

      // 登录成功：清空失败记录，并复位历史遗留的账号级锁定字段
      await this.loginAttemptService.clear(email);
      if (user.loginAttempts > 0 || user.lockedUntil) {
        user.loginAttempts = 0;
        user.lockedUntil = undefined;
        await user.save();
      }

      const token = this.jwtService.sign({
        userId: user._id,
        username: user.username,
        email: user.email,
      });

      this.logger.log(`用户登录成功: ${email}`);
      return {
        token,
        user: this.toSafeUser(user),
      };
    } catch (error) {
      this.logger.error(
        `登录失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 记录一次登录失败，并按失败次数追加一个小延迟
   *
   * 延迟只出现在失败响应上，正确密码的登录永远不会被拖慢。
   */
  private async recordLoginFailure(
    email: string,
    clientIp?: string,
  ): Promise<void> {
    const result = await this.loginAttemptService.recordFailure(
      email,
      clientIp,
    );
    this.logger.warn(
      `登录失败: 凭据错误 - ${email}, 该来源累计失败 ${result.failures} 次`,
    );
    if (result.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, result.delayMs));
    }
  }

  /**
   * 对不存在的邮箱执行一次等价耗时的 bcrypt 比对（防时序侧信道）
   */
  private async consumeDummyCompare(password: string): Promise<void> {
    try {
      await bcrypt.compare(password, DUMMY_PASSWORD_HASH);
    } catch {
      // 比对本身失败不影响流程，这里只为抹平耗时
    }
  }

  async logout(token: string, userId?: string) {
    try {
      this.logger.log('用户请求退出登录');
      await this.tokenBlacklistService.addToBlacklist(token);

      // 清除存储的 OAuth 令牌，防止令牌泄露后被滥用
      if (userId) {
        await this.userModel.updateOne(
          { _id: userId },
          {
            $set: {
              'oauthProviders.$[].accessToken': '',
              'oauthProviders.$[].refreshToken': '',
            },
          },
        );
        this.logger.log('已清除用户 OAuth 令牌');
      }

      this.logger.log('用户退出登录成功');
      return { message: '退出登录成功' };
    } catch (error) {
      this.logger.error(
        `退出登录失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 获取所有用户列表（支持分页、关键词搜索、注册来源筛选）
   * @param query 查询参数（page, pageSize, keyword, createdVia）
   * @returns 分页用户列表
   */
  async findAll(query: QueryUserDto): Promise<{
    items: User[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 10;
    const skip = (page - 1) * pageSize;

    // 构建筛选条件
    const filter: Record<string, unknown> = {};

    // 关键词搜索：模糊匹配用户名或邮箱
    if (query.keyword) {
      const escaped = query.keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { username: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    // 按注册来源筛选
    if (query.createdVia) {
      filter.createdVia = query.createdVia;
    }

    const [items, total] = await Promise.all([
      this.userModel
        .find(filter)
        .select('-password')
        .skip(skip)
        .limit(pageSize)
        .sort({ createdAt: -1 })
        .exec(),
      this.userModel.countDocuments(filter).exec(),
    ]);

    return {
      items: items.map((item) => this.toSafeUser(item)),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 获取用户统计数据（管理员用）
   * @returns 用户总数、本月新增、按注册来源分布
   */
  async getUserStats(): Promise<{
    totalUsers: number;
    newThisMonth: number;
    byPlatform: Record<string, number>;
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, newThisMonth, byPlatform] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.userModel
        .countDocuments({ createdAt: { $gte: startOfMonth } })
        .exec(),
      this.userModel
        .aggregate([{ $group: { _id: '$createdVia', count: { $sum: 1 } } }])
        .exec(),
    ]);

    const platformMap: Record<string, number> = {};
    for (const item of byPlatform) {
      platformMap[item._id || 'email'] = item.count;
    }

    return { totalUsers, newThisMonth, byPlatform: platformMap };
  }

  /**
   * 根据 ID 查找用户
   * @param id 用户 ID
   * @returns 用户对象(不包含密码)
   * @throws NotFoundException 当用户不存在时抛出
   */
  async findOne(id: string): Promise<User> {
    const user = await this.userModel.findById(id).select('-password').exec();
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return this.toSafeUser(user);
  }

  /**
   * 根据用户名查找用户
   * @param username 用户名
   * @returns 用户文档或 undefined
   */
  async findByUsername(username: string): Promise<UserDocument | undefined> {
    const user = await this.userModel.findOne({ username }).exec();
    return user || undefined;
  }

  /**
   * 更新用户信息
   * @param id 用户 ID
   * @param updateUserDto 更新 DTO(不允许包含密码)
   * @returns 更新后的用户对象(不包含密码)
   * @throws BadRequestException 当尝试修改密码时抛出
   * @throws NotFoundException 当用户不存在时抛出
   */
  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    try {
      this.logger.log(`尝试更新用户: ${id}`);

      // 不允许直接修改密码,必须使用 changePassword 方法
      if (updateUserDto.password) {
        this.logger.warn(`尝试通过 update 方法修改密码: ${id}`);
        throw new BadRequestException('请使用修改密码接口');
      }

      await this.assertFieldUnique(updateUserDto, id, '更新用户');

      const updatedUser = await this.userModel
        .findByIdAndUpdate(id, updateUserDto, { new: true })
        .select('-password')
        .exec();

      if (!updatedUser) {
        this.logger.warn(`更新用户失败: 用户不存在 - ${id}`);
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      this.logger.log(`用户更新成功: ${id}`);
      return this.toSafeUser(updatedUser);
    } catch (error) {
      this.logger.error(
        `更新用户失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 删除用户
   * @param id 用户 ID
   * @returns 被删除的用户对象
   * @throws NotFoundException 当用户不存在时抛出
   */
  async remove(id: string): Promise<User> {
    try {
      this.logger.log(`尝试删除用户: ${id}`);

      const deletedUser = await this.userModel.findByIdAndDelete(id).exec();
      if (!deletedUser) {
        this.logger.warn(`删除用户失败: 用户不存在 - ${id}`);
        throw new NotFoundException(`User with ID ${id} not found`);
      }

      this.logger.log(`用户删除成功: ${id}`);
      return this.toSafeUser(deletedUser);
    } catch (error) {
      this.logger.error(
        `删除用户失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 获取当前用户信息
   * @param userId 当前登录用户 ID
   */
  async getProfile(userId: string): Promise<User> {
    return this.findOne(userId);
  }

  /**
   * 更新当前用户信息（不允许直接修改密码）
   * @param userId 当前登录用户 ID
   * @param updateUserDto 更新字段（可包含 username/email）
   */
  async updateProfile(
    userId: string,
    updateUserDto: UpdateUserDto,
  ): Promise<User> {
    try {
      this.logger.log(`尝试更新用户资料: ${userId}`);

      // 不允许在该接口修改密码,需走修改密码专用接口
      if (updateUserDto.password) {
        this.logger.warn(`尝试通过 updateProfile 方法修改密码: ${userId}`);
        throw new BadRequestException('请使用修改密码接口');
      }

      await this.assertFieldUnique(updateUserDto, userId, '更新用户资料');

      const updated = await this.userModel
        .findByIdAndUpdate(userId, updateUserDto, { new: true })
        .select('-password')
        .exec();
      if (!updated) {
        this.logger.warn(`更新用户资料失败: 用户不存在 - ${userId}`);
        throw new NotFoundException('用户不存在');
      }

      this.logger.log(`用户资料更新成功: ${userId}`);
      return this.toSafeUser(updated);
    } catch (error) {
      this.logger.error(
        `更新用户资料失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * OAuth 用户设置密码（无需旧密码）
   * 仅允许此前没有密码的 OAuth 注册用户使用
   * @param userId 当前登录用户 ID
   * @param newPassword 新密码
   */
  async setPassword(userId: string, newPassword: string) {
    try {
      this.logger.log(`OAuth 用户尝试设置密码: ${userId}`);

      const hashed = await bcrypt.hash(newPassword, 10);

      // 原子操作：仅当用户存在且尚无密码时才写入
      const result = await this.userModel
        .findOneAndUpdate(
          { _id: userId, password: { $exists: false } },
          { $set: { password: hashed } },
          { new: true },
        )
        .select('_id')
        .exec();

      if (!result) {
        // 区分"用户不存在"和"已有密码"
        const user = await this.userModel
          .findById(userId)
          .select('_id password')
          .exec();
        if (!user) {
          this.logger.warn(`设置密码失败: 用户不存在 - ${userId}`);
          throw new NotFoundException('用户不存在');
        }
        this.logger.warn(
          `设置密码失败: 该账户已设置密码，请使用修改密码接口 - ${userId}`,
        );
        throw new BadRequestException('该账户已设置密码，请使用修改密码接口');
      }

      this.logger.log(`密码设置成功: ${userId}`);
      return { message: '密码设置成功' };
    } catch (error) {
      this.logger.error(
        `设置密码失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * 修改密码（需校验旧密码）
   * @param userId 当前登录用户 ID
   * @param dto 包含旧密码与新密码
   */
  async changePassword(userId: string, dto: ChangePasswordDto) {
    try {
      this.logger.log(`尝试修改密码: ${userId}`);

      const user = await this.userModel.findById(userId).exec();
      if (!user) {
        this.logger.warn(`修改密码失败: 用户不存在 - ${userId}`);
        throw new NotFoundException('用户不存在');
      }

      // OAuth 注册用户未设置密码，无法通过旧密码校验方式修改密码
      if (!user.password) {
        this.logger.warn(
          `修改密码失败: 该账户未设置密码（OAuth注册） - ${userId}`,
        );
        throw new BadRequestException(
          '该账户通过第三方平台注册，未设置密码，无法修改',
        );
      }

      const match = await bcrypt.compare(dto.oldPassword, user.password);
      if (!match) {
        this.logger.warn(`修改密码失败: 旧密码不正确 - ${userId}`);
        throw new BadRequestException('旧密码不正确');
      }

      const hashed = await bcrypt.hash(dto.newPassword, 10);
      await this.userModel
        .findByIdAndUpdate(userId, { password: hashed })
        .exec();

      this.logger.log(`密码修改成功: ${userId}`);
      return { message: '密码修改成功' };
    } catch (error) {
      this.logger.error(
        `修改密码失败: ${(error as Error).message}`,
        (error as Error).stack,
      );
      throw error;
    }
  }

  /**
   * OAuth 第三方登录 — 查找或创建用户
   *
   * 三种匹配策略（按优先级）：
   *   1. 同平台 + 同 platformUserId → 更新令牌（用户重新授权）
   *   2. 邮箱匹配已有用户 → 将新平台绑定到已有账户（账户关联）
   *   3. 全新用户 → 创建用户（password 为空，createdVia 标记为平台名）
   *
   * @param params OAuth 用户信息
   * @returns 用户文档和是否为新创建的标志
   */
  async findOrCreateOAuthUser(params: {
    platform: string;
    platformUserId: string;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: Date;
    nickname?: string;
    avatarUrl?: string;
    profileUrl?: string;
    email?: string;
    /** 经 OAuth 平台验证过的邮箱（如 GitHub user/emails API 返回的 verified 邮箱） */
    verifiedEmail?: string;
  }): Promise<{ user: UserDocument; isNew: boolean }> {
    const {
      platform,
      platformUserId,
      accessToken,
      refreshToken,
      tokenExpiresAt,
      nickname,
      avatarUrl,
      profileUrl,
      email,
      verifiedEmail,
    } = params;

    this.logger.log(
      `OAuth 查找/创建用户: platform=${platform}, platformUserId=${platformUserId}`,
    );

    const providerData = {
      platform,
      platformUserId,
      accessToken,
      refreshToken: refreshToken ?? undefined,
      tokenExpiresAt: tokenExpiresAt ?? undefined,
      nickname: nickname ?? undefined,
      avatarUrl: avatarUrl ?? undefined,
      profileUrl: profileUrl ?? undefined,
      email: email ?? undefined,
    };

    // 构建共享的 arrayFilter（策略 1 更新 / 竞态恢复共用）
    const elemFilter = {
      'elem.platform': platform,
      'elem.platformUserId': platformUserId,
    };

    // 构建完整的 provider 更新字段集合
    const providerUpdate: Record<string, unknown> = {
      'oauthProviders.$[elem].accessToken': accessToken,
    };
    if (refreshToken !== undefined)
      providerUpdate['oauthProviders.$[elem].refreshToken'] = refreshToken;
    if (tokenExpiresAt !== undefined)
      providerUpdate['oauthProviders.$[elem].tokenExpiresAt'] = tokenExpiresAt;
    if (nickname !== undefined)
      providerUpdate['oauthProviders.$[elem].nickname'] = nickname;
    if (avatarUrl !== undefined)
      providerUpdate['oauthProviders.$[elem].avatarUrl'] = avatarUrl;
    if (profileUrl !== undefined)
      providerUpdate['oauthProviders.$[elem].profileUrl'] = profileUrl;
    if (email !== undefined)
      providerUpdate['oauthProviders.$[elem].email'] = email;

    // ── Phase 1a: 策略 1 — 同平台同 ID，原子更新令牌 ──
    const existingByPlatform = await this.userModel
      .findOneAndUpdate(
        { oauthProviders: { $elemMatch: { platform, platformUserId } } },
        { $set: providerUpdate },
        { new: true, arrayFilters: [elemFilter] },
      )
      .exec();

    if (existingByPlatform) {
      this.logger.log(
        `已有 OAuth 绑定用户（同平台同ID）: ${existingByPlatform.email}`,
      );
      return { user: existingByPlatform, isNew: false };
    }

    // ── Phase 1b: 策略 2 — 已验证邮箱匹配，追加密平台绑定 ──
    if (verifiedEmail) {
      const existingByEmail = await this.userModel
        .findOneAndUpdate(
          {
            email: verifiedEmail,
            // 仅当该平台尚未绑定时才追加，避免重复绑定
            'oauthProviders.platform': { $ne: platform },
          },
          { $push: { oauthProviders: providerData } },
          { new: true },
        )
        .exec();

      if (existingByEmail) {
        this.logger.log(
          `邮箱匹配已有用户: ${verifiedEmail}，绑定 ${platform} 登录`,
        );
        return { user: existingByEmail, isNew: false };
      }
    }

    // ── Phase 2: 创建新用户（策略 3）──
    this.logger.log(`创建新 OAuth 用户: platform=${platform}`);

    // 生成唯一用户名
    const baseUsername =
      (nickname || `${platform}_user`)
        .replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '')
        .substring(0, 20) || `${platform}_${platformUserId.substring(0, 8)}`;
    const username = await this.generateUniqueUsername(baseUsername);

    // 邮箱处理：OAuth 可能不返回邮箱
    const userEmail = email || `${platform}_${platformUserId}@oauth.local`;

    try {
      const newUser = await this.userModel.create({
        username,
        email: userEmail,
        password: undefined,
        loginAttempts: 0,
        createdVia: platform,
        oauthProviders: [providerData],
      });

      this.logger.log(
        `OAuth 用户创建成功: ${newUser.email} (username: ${username})`,
      );
      return { user: newUser, isNew: true };
    } catch (err: any) {
      // Duplicate key (11000) 说明另一并发请求已创建用户，重试 Phase 1
      if (err.code === 11000) {
        this.logger.warn(
          `OAuth 用户创建遇到竞态 (duplicate key), 重试查找: platform=${platform}`,
        );

        // 重试 Phase 1a：同平台同 ID 查找（复用完整 providerUpdate）
        const retryPlatformUser = await this.userModel
          .findOneAndUpdate(
            { oauthProviders: { $elemMatch: { platform, platformUserId } } },
            { $set: providerUpdate },
            { new: true, arrayFilters: [elemFilter] },
          )
          .exec();

        if (retryPlatformUser) {
          this.logger.log(
            `竞态恢复成功（同平台同ID）: ${retryPlatformUser.email}`,
          );
          return { user: retryPlatformUser, isNew: false };
        }

        // 重试 Phase 1b：已验证邮箱匹配
        if (verifiedEmail) {
          const retryEmailUser = await this.userModel
            .findOneAndUpdate(
              {
                email: verifiedEmail,
                'oauthProviders.platform': { $ne: platform },
              },
              { $push: { oauthProviders: providerData } },
              { new: true },
            )
            .exec();

          if (retryEmailUser) {
            this.logger.log(
              `竞态恢复成功（邮箱匹配）: ${retryEmailUser.email}`,
            );
            return { user: retryEmailUser, isNew: false };
          }
        }

        // Phase 1 重试未找到用户 → 可能是 username 唯一索引冲突
        // 重新生成 username 并重试 create
        for (let i = 0; i < 3; i++) {
          const newUsername = await this.generateUniqueUsername(baseUsername);
          try {
            const newUser = await this.userModel.create({
              username: newUsername,
              email: userEmail,
              password: undefined,
              loginAttempts: 0,
              createdVia: platform,
              oauthProviders: [providerData],
            });

            this.logger.log(
              `OAuth 用户创建成功 (username 重试): ${newUser.email} (username: ${newUsername})`,
            );
            return { user: newUser, isNew: true };
          } catch (retryErr: any) {
            if (retryErr.code !== 11000) throw retryErr;
            this.logger.warn(`username 重试 ${i + 1}/3 冲突: ${newUsername}`);
          }
        }

        this.logger.error(
          `OAuth 用户创建失败: username 重试 3 次均冲突 - platform=${platform}`,
        );
        throw new BadRequestException('用户创建失败，请稍后重试');
      }
      throw err;
    }
  }

  /**
   * 原子更新指定 OAuth 提供商的令牌
   * 用于令牌刷新等场景，避免 read-modify-write 竞态
   */
  async updateOAuthTokens(
    userId: string,
    platform: string,
    platformUserId: string,
    accessToken: string,
    refreshToken: string,
    tokenExpiresAt?: Date,
  ): Promise<void> {
    await this.userModel.updateOne(
      {
        _id: userId,
        oauthProviders: { $elemMatch: { platform, platformUserId } },
      },
      {
        $set: {
          'oauthProviders.$.accessToken': accessToken,
          'oauthProviders.$.refreshToken': refreshToken,
          'oauthProviders.$.tokenExpiresAt': tokenExpiresAt,
        },
      },
    );
  }

  /**
   * 生成唯一用户名
   * 如果基准用户名已被占用，追加随机后缀直到找到唯一值
   */
  private async generateUniqueUsername(base: string): Promise<string> {
    let username = base;
    let attempts = 0;

    while (attempts < 10) {
      const exists = await this.userModel.findOne({ username }).exec();
      if (!exists) return username;

      // 追加 4 位随机数字
      const suffix = Math.floor(1000 + Math.random() * 9000).toString();
      username = `${base.substring(0, 16)}_${suffix}`;
      attempts++;
    }

    // 极端情况：使用时间戳兜底
    return `${base}_${Date.now().toString(36)}`;
  }

  /**
   * 检查邮箱和用户名的唯一性（排除指定用户 ID）
   * @param fields 包含待检查 email/username 的对象
   * @param excludeId 排除的用户 ID（当前用户自身）
   * @param action 日志中的操作描述
   */
  private async assertFieldUnique(
    fields: { email?: string; username?: string },
    excludeId: string,
    action: string,
  ): Promise<void> {
    const checks: Promise<{ field: string; exists: boolean }>[] = [];

    if (fields.email) {
      checks.push(
        this.userModel
          .findOne({ email: fields.email })
          .exec()
          .then((doc) => ({
            field: '邮箱',
            exists: !!doc && doc._id.toString() !== excludeId,
          })),
      );
    }
    if (fields.username) {
      checks.push(
        this.userModel
          .findOne({ username: fields.username })
          .exec()
          .then((doc) => ({
            field: '用户名',
            exists: !!doc && doc._id.toString() !== excludeId,
          })),
      );
    }

    const results = await Promise.all(checks);
    for (const { field } of results.filter((r) => r.exists)) {
      const value = field === '邮箱' ? fields.email : fields.username;
      this.logger.warn(`${action}失败: ${field}已被占用 - ${value}`);
      throw new ConflictException(`${field}已被占用`);
    }
  }
}
