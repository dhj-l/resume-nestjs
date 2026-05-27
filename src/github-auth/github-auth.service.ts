import {
  Injectable,
  Inject,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import axios from 'axios';
import { UserService } from '../user/user.service';
import { generateState, verifyState } from '../common/utils/state.util';
import { encryptToken, decryptToken } from '../common/utils/crypto.util';
import { ENCRYPTION_KEY } from '../common/crypto.module';
import {
  GitHubTokenResponse,
  GitHubUserResponse,
  GitHubEmailEntry,
  GitHubOAuthConfig,
} from './interfaces/github-api.interface';

/**
 * GitHub OAuth 认证服务
 *
 * 实现 OAuth 2.0 授权码流程（Authorization Code Grant）：
 *   1. 生成授权 URL（含防 CSRF 的 state 参数）
 *   2. 处理回调：验证 state → 换取 token → 获取用户信息 → 创建/绑定用户 → 签发 JWT
 */
@Injectable()
export class GitHubAuthService {
  private readonly logger = new Logger(GitHubAuthService.name);
  private readonly config: GitHubOAuthConfig;
  private readonly encryptionKey: Buffer | null;

  // GitHub OAuth API 端点
  private static readonly AUTHORIZE_URL =
    'https://github.com/login/oauth/authorize';
  private static readonly TOKEN_URL =
    'https://github.com/login/oauth/access_token';
  private static readonly USER_API_URL = 'https://api.github.com/user';
  private static readonly EMAILS_API_URL = 'https://api.github.com/user/emails';

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @Inject(ENCRYPTION_KEY) encryptionKey: Buffer | null,
  ) {
    this.config = {
      clientId: configService.getOrThrow<string>('GITHUB_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('GITHUB_CLIENT_SECRET'),
      redirectUri: configService.getOrThrow<string>('GITHUB_REDIRECT_URI'),
      scope:
        configService.get<string>('GITHUB_SCOPE') || 'read:user user:email',
      frontendCallbackUrl: configService.getOrThrow<string>(
        'GITHUB_FRONTEND_CALLBACK_URL',
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

  /**
   * 生成 GitHub OAuth 授权 URL
   *
   * 拼接 GitHub 授权页面地址，包含：
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
      state,
    });

    const authUrl = `${GitHubAuthService.AUTHORIZE_URL}?${params.toString()}`;

    this.logger.log(
      `生成 GitHub 授权 URL，state 前8位: ${state.substring(0, 8)}...`,
    );
    return { authUrl, state };
  }

  /**
   * 处理 GitHub OAuth 回调
   *
   * 完整流程：
   *   ① 校验 state 参数（防 CSRF + 时效性检查）
   *   ② 用授权码换取 access_token
   *   ③ 用 access_token 获取 GitHub 用户信息
   *   ④ 创建或绑定本地用户账户
   *   ⑤ 签发 JWT 令牌
   *
   * @param code GitHub 回调携带的授权码
   * @param state GitHub 回调携带的 state 参数
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

    // ③ 并行获取 GitHub 用户信息和已验证邮箱
    const [githubUser, verifiedEmail] = await Promise.all([
      this.fetchGitHubUser(tokenResponse.access_token),
      this.fetchGitHubVerifiedEmail(tokenResponse.access_token),
    ]);
    this.logger.log(
      `获取 GitHub 用户信息成功: ${githubUser.login} (ID: ${githubUser.id})`,
    );
    if (verifiedEmail) {
      this.logger.log(`获取到 GitHub 已验证邮箱: ${verifiedEmail}`);
    }

    // ④ 创建或绑定本地用户
    // 加密存储 access_token（如果配置了加密密钥）
    const storedToken = this.encryptionKey
      ? encryptToken(tokenResponse.access_token, this.encryptionKey)
      : tokenResponse.access_token;

    const { user, isNew } = await this.userService.findOrCreateOAuthUser({
      platform: 'github',
      platformUserId: String(githubUser.id),
      accessToken: storedToken,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
      nickname: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
      profileUrl: githubUser.html_url,
      email: githubUser.email || undefined,
      verifiedEmail,
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
   * 获取前端 OAuth 回调页地址
   *
   * 后端处理完 OAuth 后 302 重定向到此地址，token 通过 URL fragment 传递。
   */
  getFrontendCallbackUrl(): string {
    return this.config.frontendCallbackUrl;
  }

  /**
   * 解密存储的 access_token（供内部使用，如调用 GitHub API）
   */
  decryptStoredToken(encryptedToken: string): string {
    if (!this.encryptionKey) {
      return encryptedToken; // 未加密存储，直接返回
    }
    return decryptToken(encryptedToken, this.encryptionKey);
  }

  // ───────────────────── 私有方法 ─────────────────────

  /**
   * POST https://github.com/login/oauth/access_token
   * 使用授权码换取 access_token
   */
  private async exchangeCodeForToken(
    code: string,
  ): Promise<GitHubTokenResponse> {
    try {
      const { data } = await axios.post<GitHubTokenResponse>(
        GitHubAuthService.TOKEN_URL,
        {
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
        },
        {
          headers: {
            Accept: 'application/json',
            'User-Agent': 'resume-nestjs-app',
          },
          timeout: 10000,
        },
      );

      if (!data.access_token) {
        throw new BadRequestException('GitHub 返回的令牌为空');
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
   * GET https://api.github.com/user
   * 使用 access_token 获取已授权用户信息
   *
   * 注意：GitHub API 使用 Authorization header 传递 token（非 query 参数）
   * 且必须设置 User-Agent header，否则返回 403
   */
  private async fetchGitHubUser(
    accessToken: string,
  ): Promise<GitHubUserResponse> {
    try {
      const { data } = await axios.get<GitHubUserResponse>(
        GitHubAuthService.USER_API_URL,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'resume-nestjs-app',
          },
          timeout: 10000,
        },
      );

      if (!data || !data.id) {
        throw new BadRequestException(
          '获取 GitHub 用户信息失败：返回数据不完整',
        );
      }

      return data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.error(
        `获取 GitHub 用户信息失败: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      throw new BadRequestException('获取 GitHub 用户信息失败，请重新授权');
    }
  }

  /**
   * GET https://api.github.com/user/emails
   * 获取 GitHub 已验证的主邮箱地址
   *
   * 仅返回经过 GitHub 验证（verified: true）且为主邮箱（primary: true）的地址，
   * 用于安全地绑定已有账户，防止攻击者通过设置相同未验证邮箱劫持账户。
   *
   * 需要 user:email scope。
   */
  private async fetchGitHubVerifiedEmail(
    accessToken: string,
  ): Promise<string | undefined> {
    try {
      const { data } = await axios.get<GitHubEmailEntry[]>(
        GitHubAuthService.EMAILS_API_URL,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'resume-nestjs-app',
          },
          timeout: 10000,
        },
      );

      // 优先返回已验证的主邮箱
      const primaryVerified = data.find((e) => e.verified && e.primary);
      if (primaryVerified) {
        return primaryVerified.email;
      }

      // 退而求其次，返回任意已验证邮箱
      const anyVerified = data.find((e) => e.verified);
      return anyVerified?.email;
    } catch (error: unknown) {
      // 获取验证邮箱失败不应阻断 OAuth 流程，降级为不使用邮箱匹配
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.warn(
        `获取 GitHub 验证邮箱失败（降级为不使用邮箱匹配）: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      return undefined;
    }
  }
}
