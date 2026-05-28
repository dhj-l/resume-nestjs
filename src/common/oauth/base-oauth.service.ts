import { Inject, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserService } from '../../user/user.service';
import { generateState, verifyState } from '../utils/state.util';
import { encryptToken, decryptToken } from '../utils/crypto.util';
import { ENCRYPTION_KEY } from '../crypto.module';
import { sanitizeOAuthUser } from './sanitize-user.util';
import type {
  OAuthConfig,
  OAuthCallbackResult,
  OAuthTokenData,
  FindOrCreateOAuthUserParams,
} from './oauth.types';

/**
 * OAuth 认证服务抽象基类
 *
 * 使用模板方法模式封装 OAuth 2.0 授权码流程的通用逻辑。
 * 子类只需实现平台差异化的抽象方法。
 *
 * 模板流程（handleCallback）：
 *   ① 校验 state（防 CSRF）
 *   ② 授权码换 token（exchangeCodeForToken）
 *   ③ 后置钩子（afterTokenExchange，默认空实现）
 *   ④ 获取用户信息（fetchUserInfo）
 *   ⑤ 构建 findOrCreate 参数（buildFindOrCreateParams）
 *   ⑥ 加密 token → 创建/绑定用户 → 签发 JWT
 */
export abstract class BaseOAuthService {
  protected readonly logger: Logger;
  protected readonly config: OAuthConfig;
  private readonly encryptionKey: Buffer | null;

  // ───────────────────── 抽象属性 ─────────────────────

  /** 平台标识（如 'gitee'、'github'、'qq'），用于日志和 findOrCreateOAuthUser */
  abstract readonly platformName: string;

  // ───────────────────── 构造函数 ─────────────────────

  constructor(
    protected readonly configService: ConfigService,
    protected readonly userService: UserService,
    protected readonly jwtService: JwtService,
    @Inject(ENCRYPTION_KEY) encryptionKey: Buffer | null,
  ) {
    this.logger = new Logger(this.constructor.name);

    const prefix = this.getConfigPrefix();
    this.config = {
      clientId: configService.getOrThrow<string>(`${prefix}_CLIENT_ID`),
      clientSecret: configService.getOrThrow<string>(`${prefix}_CLIENT_SECRET`),
      redirectUri: configService.getOrThrow<string>(`${prefix}_REDIRECT_URI`),
      scope:
        configService.get<string>(`${prefix}_SCOPE`) || this.getDefaultScope(),
      frontendCallbackUrl: configService.getOrThrow<string>(
        `${prefix}_FRONTEND_CALLBACK_URL`,
      ),
    };

    this.encryptionKey = encryptionKey;
    if (encryptionKey) {
      this.logger.log('令牌加密已启用 (AES-256-GCM)');
    } else {
      this.logger.warn(
        '⚠️  未配置 ENCRYPTION_KEY，OAuth 令牌将以明文存储（仅开发环境可接受）',
      );
    }
  }

  // ───────────────────── 抽象方法（子类必须实现） ─────────────────────

  /** 返回环境变量前缀（如 'GITEE'、'GITHUB'、'QQ'） */
  abstract getConfigPrefix(): string;

  /** 返回授权页面基础 URL */
  abstract getAuthorizeUrl(): string;

  /** 返回授权 URL 的查询参数（不含 client_id / redirect_uri / scope） */
  abstract getAuthUrlParams(state: string): Record<string, string>;

  /** 使用授权码换取 access_token */
  abstract exchangeCodeForToken(code: string): Promise<OAuthTokenData>;

  /** 获取平台用户信息，context 携带 afterTokenExchange 的额外数据 */
  abstract fetchUserInfo(
    accessToken: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>>;

  /** 将平台用户信息映射为 findOrCreateOAuthUser 的参数 */
  abstract buildFindOrCreateParams(
    accessToken: string,
    tokenData: OAuthTokenData,
    userInfo: Record<string, unknown>,
    context: Record<string, unknown>,
  ): FindOrCreateOAuthUserParams;

  /** 使用 refresh_token 续期 access_token（平台不支持时抛出 BadRequestException） */
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokenData>;

  // ───────────────────── 钩子方法（可选覆盖） ─────────────────────

  /**
   * token 交换后的后置钩子
   *
   * 默认返回空对象。子类可覆盖此方法来执行额外的 API 调用，
   * 返回的 context 会传递给 fetchUserInfo 和 buildFindOrCreateParams。
   *
   * - GitHub: 并行获取用户信息和已验证邮箱 → { githubUser, verifiedEmail }
   * - QQ: 获取 OpenID → { openId }
   */
  protected async afterTokenExchange(
    _accessToken: string,
  ): Promise<Record<string, unknown>> {
    return {};
  }

  // ───────────────────── 可选覆盖 ─────────────────────

  /** 返回默认的 scope 值，子类可覆盖 */
  protected getDefaultScope(): string {
    return '';
  }

  // ───────────────────── 模板方法（不可覆盖） ─────────────────────

  /**
   * 生成 OAuth 授权 URL
   *
   * 拼接授权页面地址，包含 client_id、redirect_uri、scope、state 等参数。
   */
  getAuthUrl(): { authUrl: string; state: string } {
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const state = generateState(secret);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      ...this.getAuthUrlParams(state),
    });

    const authUrl = `${this.getAuthorizeUrl()}?${params.toString()}`;

    this.logger.log(
      `生成 ${this.platformName} 授权 URL，state 前8位: ${state.substring(0, 8)}...`,
    );
    return { authUrl, state };
  }

  /**
   * 处理 OAuth 回调
   *
   * 完整流程：校验 state → 换 token → 后置钩子 → 获取用户信息 → 创建/绑定 → 签发 JWT
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<OAuthCallbackResult> {
    // ① State 校验（防 CSRF）
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    if (!verifyState(state, secret)) {
      this.logger.warn('OAuth 回调 state 校验失败（可能已过期或伪造请求）');
      throw new BadRequestException('state 参数无效或已过期，请重新发起授权');
    }
    this.logger.log('State 校验通过');

    // ② 授权码换 token
    const tokenData = await this.exchangeCodeForToken(code);
    this.logger.log('Access token 获取成功');

    // ③ 后置钩子（GitHub 获取邮箱、QQ 获取 OpenID 等）
    const context = await this.afterTokenExchange(tokenData.access_token);

    // ④ 获取用户信息
    const userInfo = await this.fetchUserInfo(tokenData.access_token, context);
    this.logger.log(`获取 ${this.platformName} 用户信息成功`);

    // ⑤ 构建 findOrCreate 参数
    const params = this.buildFindOrCreateParams(
      tokenData.access_token,
      tokenData,
      userInfo,
      context,
    );

    // ⑥ 加密存储 access_token
    const storedToken = this.encryptionKey
      ? encryptToken(tokenData.access_token, this.encryptionKey)
      : tokenData.access_token;

    // ⑦ 创建或绑定本地用户
    const { user, isNew } = await this.userService.findOrCreateOAuthUser({
      ...params,
      accessToken: storedToken,
    });

    this.logger.log(
      `${isNew ? '创建新用户' : '绑定已有用户'}: ${(user as any).email || (user as any).username}`,
    );

    // ⑧ 签发 JWT
    const token = this.jwtService.sign({
      userId: user._id,
      username: user.username,
      email: user.email,
    });

    // ⑨ 脱敏并返回
    const userObject = sanitizeOAuthUser(user as any);

    return { token, user: userObject };
  }

  /**
   * 获取前端 OAuth 回调页地址
   */
  getFrontendCallbackUrl(): string {
    return this.config.frontendCallbackUrl;
  }

  /**
   * 解密存储的 access_token
   */
  decryptStoredToken(encryptedToken: string): string {
    if (!this.encryptionKey) {
      return encryptedToken;
    }
    return decryptToken(encryptedToken, this.encryptionKey);
  }

  /**
   * 刷新用户的 OAuth access_token
   *
   * 从数据库读取存储的 refresh_token，调用平台刷新接口，更新数据库中的令牌。
   */
  async refreshUserToken(userId: string): Promise<{ tokenExpiresAt?: Date }> {
    const user = await this.userService.findOne(userId);
    if (!user) {
      throw new BadRequestException('用户不存在');
    }

    const provider = (user as any).oauthProviders?.find(
      (p: any) => p.platform === this.platformName,
    );
    if (!provider) {
      throw new BadRequestException(`未绑定 ${this.platformName} 账号`);
    }

    if (!provider.refreshToken) {
      throw new BadRequestException(
        `${this.platformName} 不支持令牌刷新，请重新授权`,
      );
    }

    // 解密存储的 refresh_token
    const decryptedRefreshToken = this.encryptionKey
      ? decryptToken(provider.refreshToken, this.encryptionKey)
      : provider.refreshToken;

    // 调用平台特定的刷新逻辑（子类实现）
    const tokenData = await this.refreshAccessToken(decryptedRefreshToken);

    // 加密新 token 后存储
    const storedAccessToken = this.encryptionKey
      ? encryptToken(tokenData.access_token, this.encryptionKey)
      : tokenData.access_token;

    const storedRefreshToken = tokenData.refresh_token
      ? this.encryptionKey
        ? encryptToken(tokenData.refresh_token, this.encryptionKey)
        : tokenData.refresh_token
      : provider.refreshToken;

    const tokenExpiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000)
      : provider.tokenExpiresAt;

    // 原子更新数据库
    await this.userService.updateOAuthTokens(
      userId,
      this.platformName,
      provider.platformUserId,
      storedAccessToken,
      storedRefreshToken,
      tokenExpiresAt,
    );

    this.logger.log(`${this.platformName} 令牌刷新成功`);
    return { tokenExpiresAt };
  }
}
