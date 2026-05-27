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
  QQTokenResponse,
  QQUserResponse,
  QQOAuthConfig,
  QQOpenIDResponse,
} from './interfaces/qq-api.interface';

/**
 * QQ OAuth 认证服务
 *
 * 实现 OAuth 2.0 授权码流程（Authorization Code Grant）：
 *   1. 生成授权 URL（含防 CSRF 的 state 参数）
 *   2. 处理回调：验证 state → 换取 token → 获取 OpenID → 获取用户信息 → 创建/绑定用户 → 签发 JWT
 *
 * QQ OAuth 特殊性：
 *   - 需要额外调用 /me 接口获取 OpenID
 *   - Token 响应默认为 URL 编码格式，需添加 fmt=json
 *   - 用户信息接口需要 oauth_consumer_key 参数
 *   - 不返回邮箱地址
 */
@Injectable()
export class QQAuthService {
  private readonly logger = new Logger(QQAuthService.name);
  private readonly config: QQOAuthConfig;
  private readonly encryptionKey: Buffer | null;

  // QQ OAuth API 端点
  private static readonly AUTHORIZE_URL =
    'https://graph.qq.com/oauth2.0/authorize';
  private static readonly TOKEN_URL = 'https://graph.qq.com/oauth2.0/token';
  private static readonly OPENID_URL = 'https://graph.qq.com/oauth2.0/me';
  private static readonly USER_API_URL =
    'https://graph.qq.com/user/get_user_info';

  constructor(
    private readonly configService: ConfigService,
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    @Inject(ENCRYPTION_KEY) encryptionKey: Buffer | null,
  ) {
    this.config = {
      clientId: configService.getOrThrow<string>('QQ_CLIENT_ID'),
      clientSecret: configService.getOrThrow<string>('QQ_CLIENT_SECRET'),
      redirectUri: configService.getOrThrow<string>('QQ_REDIRECT_URI'),
      scope: configService.get<string>('QQ_SCOPE') || 'get_user_info',
      frontendCallbackUrl: configService.getOrThrow<string>(
        'QQ_FRONTEND_CALLBACK_URL',
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
   * 生成 QQ OAuth 授权 URL
   *
   * 拼接 QQ 授权页面地址，包含：
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

    const authUrl = `${QQAuthService.AUTHORIZE_URL}?${params.toString()}`;

    this.logger.log(
      `生成 QQ 授权 URL，state 前8位: ${state.substring(0, 8)}...`,
    );
    return { authUrl, state };
  }

  /**
   * 处理 QQ OAuth 回调
   *
   * 完整流程：
   *   ① 校验 state 参数（防 CSRF + 时效性检查）
   *   ② 用授权码换取 access_token
   *   ③ 用 access_token 获取 OpenID（QQ 特有步骤）
   *   ④ 用 access_token + OpenID 获取 QQ 用户信息
   *   ⑤ 创建或绑定本地用户账户
   *   ⑥ 签发 JWT 令牌
   *
   * @param code QQ 回调携带的授权码
   * @param state QQ 回调携带的 state 参数
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

    // ③ 获取 OpenID（QQ 特有步骤）
    const openIdResponse = await this.fetchOpenID(tokenResponse.access_token);
    this.logger.log(`获取 OpenID 成功: ${openIdResponse.openid}`);

    // ④ 获取 QQ 用户信息
    const qqUser = await this.fetchQQUser(
      tokenResponse.access_token,
      openIdResponse.openid,
    );
    this.logger.log(`获取 QQ 用户信息成功: ${qqUser.nickname}`);

    // ⑤ 创建或绑定本地用户
    const tokenExpiresAt = new Date(
      Date.now() + tokenResponse.expires_in * 1000,
    );

    // 加密存储 access_token（如果配置了加密密钥）
    const storedToken = this.encryptionKey
      ? encryptToken(tokenResponse.access_token, this.encryptionKey)
      : tokenResponse.access_token;

    const { user, isNew } = await this.userService.findOrCreateOAuthUser({
      platform: 'qq',
      platformUserId: openIdResponse.openid,
      accessToken: storedToken,
      refreshToken: tokenResponse.refresh_token || undefined,
      tokenExpiresAt,
      nickname: qqUser.nickname,
      avatarUrl:
        qqUser.figureurl_qq || qqUser.figureurl_qq_2 || qqUser.figureurl,
      profileUrl: undefined, // QQ 没有个人主页 URL
      email: undefined, // QQ API 不返回邮箱
    });

    this.logger.log(
      `${isNew ? '创建新用户' : '绑定已有用户'}: ${user.email || user.username}`,
    );

    // ⑥ 签发 JWT
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
   * 解密存储的 access_token（供内部使用，如调用 QQ API）
   */
  decryptStoredToken(encryptedToken: string): string {
    if (!this.encryptionKey) {
      return encryptedToken; // 未加密存储，直接返回
    }
    return decryptToken(encryptedToken, this.encryptionKey);
  }

  // ───────────────────── 私有方法 ─────────────────────

  /**
   * POST https://graph.qq.com/oauth2.0/token
   * 使用授权码换取 access_token
   *
   * QQ 特殊性：
   *   - 默认返回 URL 编码格式，需添加 fmt=json 获取 JSON
   *   - 请求体使用 application/x-www-form-urlencoded 格式
   */
  private async exchangeCodeForToken(code: string): Promise<QQTokenResponse> {
    try {
      const { data } = await axios.post<QQTokenResponse>(
        QQAuthService.TOKEN_URL,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          fmt: 'json', // 关键：强制返回 JSON 格式
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Accept: 'application/json',
          },
          timeout: 10000,
        },
      );

      if (!data.access_token) {
        throw new BadRequestException('QQ 返回的令牌为空');
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
   * GET https://graph.qq.com/oauth2.0/me
   * 使用 access_token 获取用户 OpenID
   *
   * QQ 特有步骤：OpenID 是用户在当前应用下的唯一标识，必须先获取才能调用其他接口
   *
   * 特殊处理：
   *   - 需要 fmt=json 参数，否则返回 JSONP 格式
   *   - 兼容 JSONP callback(...) 格式的响应
   */
  private async fetchOpenID(accessToken: string): Promise<QQOpenIDResponse> {
    try {
      const { data } = await axios.get<string | QQOpenIDResponse>(
        QQAuthService.OPENID_URL,
        {
          params: {
            access_token: accessToken,
            fmt: 'json', // 关键：强制返回 JSON 格式
          },
          timeout: 10000,
        },
      );

      // QQ 可能返回字符串（JSONP 格式），需要解析
      let parsed: QQOpenIDResponse;
      if (typeof data === 'string') {
        // 兼容 JSONP callback(...) 格式
        const jsonMatch = (data as string).match(/callback\(\s*({.*})\s*\)/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          throw new BadRequestException('QQ OpenID 响应格式异常');
        }
      } else {
        parsed = data;
      }

      if (!parsed.openid) {
        throw new BadRequestException('QQ 返回的 OpenID 为空');
      }

      return parsed;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.error(
        `获取 OpenID 失败: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      throw new BadRequestException('获取 OpenID 失败，请重新授权');
    }
  }

  /**
   * GET https://graph.qq.com/user/get_user_info
   * 使用 access_token + openid 获取已授权用户信息
   *
   * QQ 特殊性：
   *   - 需要 oauth_consumer_key（即应用的 client_id）参数
   *   - 需要 openid 参数
   *   - 通过 ret 字段判断是否成功（ret !== 0 表示失败）
   */
  private async fetchQQUser(
    accessToken: string,
    openid: string,
  ): Promise<QQUserResponse> {
    try {
      const { data } = await axios.get<QQUserResponse>(
        QQAuthService.USER_API_URL,
        {
          params: {
            access_token: accessToken,
            oauth_consumer_key: this.config.clientId, // QQ 使用 appid，非隐式传递
            openid,
            format: 'json',
          },
          timeout: 10000,
        },
      );

      // QQ API 通过 ret 字段返回状态码，0 表示成功
      if (data.ret !== 0) {
        throw new BadRequestException(
          `获取 QQ 用户信息失败: ${data.msg} (ret=${data.ret})`,
        );
      }

      return data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.error(
        `获取 QQ 用户信息失败: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      throw new BadRequestException('获取 QQ 用户信息失败，请重新授权');
    }
  }
}
