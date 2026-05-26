import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { UserService } from '../user/user.service';
import { generateState, verifyState } from './utils/state.util';
import {
  encryptToken,
  decryptToken,
  deriveEncryptionKey,
} from './utils/crypto.util';
import {
  GiteeTokenResponse,
  GiteeUserResponse,
  GiteeOAuthConfig,
} from './interfaces/gitee-api.interface';

/**
 * Gitee OAuth 认证服务
 *
 * 实现 OAuth 2.0 授权码流程（Authorization Code Grant）：
 *   1. 生成授权 URL（含防 CSRF 的 state 参数）
 *   2. 处理回调：验证 state → 换取 token → 获取用户信息 → 创建/绑定用户 → 签发 JWT
 */
@Injectable()
export class GiteeAuthService {
  private readonly logger = new Logger(GiteeAuthService.name);
  private readonly config: GiteeOAuthConfig;
  private readonly encryptionKey: Buffer | null;

  // Gitee OAuth API 端点
  private static readonly AUTHORIZE_URL = 'https://gitee.com/oauth/authorize';
  private static readonly TOKEN_URL = 'https://gitee.com/oauth/token';
  private static readonly USER_API_URL = 'https://gitee.com/api/v5/user';

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {
    this.config = {
      clientId: configService.getOrThrow<string>('GITEE_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GITEE_CLIENT_SECRET'),
      redirectUri: configService.getOrThrow<string>('GITEE_REDIRECT_URI'),
      scope: configService.get<string>('GITEE_SCOPE') || 'user_info',
    };

    // 初始化令牌加密密钥（生产环境必须配置，开发环境自动生成）
    const encKey = configService.get<string>('ENCRYPTION_KEY');
    if (encKey) {
      this.encryptionKey = deriveEncryptionKey(encKey);
      this.logger.log('令牌加密已启用 (AES-256-GCM)');
    } else {
      this.encryptionKey = null;
      this.logger.warn(
        '⚠️  未配置 ENCRYPTION_KEY，OAuth 令牌将以明文存储（仅开发环境可接受）',
      );
    }
  }

  /**
   * 生成 Gitee OAuth 授权 URL
   *
   * 拼接 Gitee 授权页面地址，包含：
   *   - client_id: 应用 ID
   *   - redirect_uri: 回调地址
   *   - scope: 权限范围
   *   - state: 防 CSRF 签名参数（5分钟有效）
   *
   * @returns 包含 authUrl 和 state 的对象（state 仅用于调试，前端无需处理）
   */
  getAuthUrl(): { authUrl: string; state: string } {
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    const state = generateState(secret);

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      scope: this.config.scope,
      response_type: 'code',
      state,
    });

    const authUrl = `${GiteeAuthService.AUTHORIZE_URL}?${params.toString()}`;

    this.logger.log(
      `生成 Gitee 授权 URL，state 前8位: ${state.substring(0, 8)}...`,
    );
    return { authUrl, state };
  }

  /**
   * 处理 Gitee OAuth 回调
   *
   * 完整流程：
   *   ① 校验 state 参数（防 CSRF + 时效性检查）
   *   ② 用授权码换取 access_token
   *   ③ 用 access_token 获取 Gitee 用户信息
   *   ④ 创建或绑定本地用户账户
   *   ⑤ 签发 JWT 令牌
   *
   * @param code Gitee 回调携带的授权码
   * @param state Gitee 回调携带的 state 参数
   * @returns { token, user } JWT 令牌和用户信息
   */
  async handleCallback(
    code: string,
    state: string,
  ): Promise<{ token: string; user: Record<string, unknown> }> {
    // ① State 校验（防 CSRF）
    const secret = this.configService.getOrThrow<string>('JWT_SECRET');
    if (!verifyState(state, secret)) {
      this.logger.warn('OAuth 回调 state 校验失败（可能已过期或伪造请求）');
      throw new BadRequestException('state 参数无效或已过期，请重新发起授权');
    }
    this.logger.log('State 校验通过');

    // ② 用授权码换取 access_token
    const tokenResponse = await this.exchangeCodeForToken(code);
    this.logger.log('Access token 获取成功');

    // ③ 获取 Gitee 用户信息
    const giteeUser = await this.fetchGiteeUser(tokenResponse.access_token);
    this.logger.log(
      `获取 Gitee 用户信息成功: ${giteeUser.login} (ID: ${giteeUser.id})`,
    );

    // ④ 创建或绑定本地用户
    const tokenExpiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    );

    // 加密存储 access_token（如果配置了加密密钥）
    const storedToken = this.encryptionKey
      ? encryptToken(tokenResponse.access_token, this.encryptionKey)
      : tokenResponse.access_token;

    const { user, isNew } = await this.userService.findOrCreateOAuthUser({
      platform: 'gitee',
      platformUserId: String(giteeUser.id),
      accessToken: storedToken,
      refreshToken: tokenResponse.refresh_token || undefined,
      tokenExpiresAt,
      nickname: giteeUser.name || giteeUser.login,
      avatarUrl: giteeUser.avatar_url,
      profileUrl: giteeUser.html_url,
      email: giteeUser.email || undefined,
    });

    this.logger.log(
      `${isNew ? '创建新用户' : '绑定已有用户'}: ${user.email || user.username}`,
    );

    // ⑤ 签发 JWT
    const token = this.jwtService.sign({
      userId: user._id,
      username: user.username,
      email: user.email,
    });

    // 构造返回的用户对象（剔除敏感字段）
    const userObject = (user as any).toObject ? (user as any).toObject() : user;
    // 从返回对象中移除敏感信息
    if (userObject.oauthProviders) {
      userObject.oauthProviders = userObject.oauthProviders.map(
        (p: Record<string, unknown>) => ({
          platform: p.platform,
          platformUserId: p.platformUserId,
          nickname: p.nickname,
          avatarUrl: p.avatarUrl,
          profileUrl: p.profileUrl,
          // 不返回 accessToken / refreshToken / tokenExpiresAt
        }),
      );
    }
    Reflect.deleteProperty(userObject, 'password');

    return { token, user: userObject };
  }

  /**
   * 解密存储的 access_token（供内部使用，如调用 Gitee API）
   */
  decryptStoredToken(encryptedToken: string): string {
    if (!this.encryptionKey) {
      return encryptedToken; // 未加密存储，直接返回
    }
    return decryptToken(encryptedToken, this.encryptionKey);
  }

  // ───────────────────── 私有方法 ─────────────────────

  /**
   * POST https://gitee.com/oauth/token
   * 使用授权码换取 access_token
   */
  private async exchangeCodeForToken(
    code: string,
  ): Promise<GiteeTokenResponse> {
    try {
      const { data } = await axios.post<GiteeTokenResponse>(
        GiteeAuthService.TOKEN_URL,
        {
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        },
        {
          headers: { Accept: 'application/json' },
          timeout: 10000,
        },
      );

      if (!data.access_token) {
        throw new BadRequestException('Gitee 返回的令牌为空');
      }

      return data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.error(
        `换取 access_token 失败: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      throw new BadRequestException('授权码无效或已过期，请重新发起授权');
    }
  }

  /**
   * GET https://gitee.com/api/v5/user
   * 使用 access_token 获取已授权用户信息
   */
  private async fetchGiteeUser(
    accessToken: string,
  ): Promise<GiteeUserResponse> {
    try {
      const { data } = await axios.get<GiteeUserResponse>(
        GiteeAuthService.USER_API_URL,
        {
          params: { access_token: accessToken },
          timeout: 10000,
        },
      );

      if (!data || !data.id) {
        throw new BadRequestException(
          '获取 Gitee 用户信息失败：返回数据不完整',
        );
      }

      return data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.error(
        `获取 Gitee 用户信息失败: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      throw new BadRequestException('获取 Gitee 用户信息失败，请重新授权');
    }
  }
}
