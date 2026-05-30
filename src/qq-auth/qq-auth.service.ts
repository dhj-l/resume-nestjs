import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseOAuthService } from '../common/oauth/base-oauth.service';
import type {
  OAuthTokenData,
  FindOrCreateOAuthUserParams,
} from '../common/oauth/oauth.types';
import {
  QQTokenResponse,
  QQUserResponse,
  QQOpenIDResponse,
} from './interfaces/qq-api.interface';

/**
 * QQ OAuth 认证服务
 *
 * 继承 BaseOAuthService，仅实现 QQ 平台差异化的逻辑。
 *
 * QQ OAuth 特殊性：
 *   - 需要额外调用 /me 接口获取 OpenID
 *   - Token 响应默认为 URL 编码格式，需添加 fmt=json
 *   - 用户信息接口需要 oauth_consumer_key 参数
 *   - 不返回邮箱地址
 */
@Injectable()
export class QQAuthService extends BaseOAuthService {
  readonly platformName = 'qq';

  // ───────────────────── 抽象方法实现 ─────────────────────

  getConfigPrefix(): string {
    return 'QQ';
  }

  protected getDefaultScope(): string {
    return 'get_user_info';
  }

  getAuthorizeUrl(): string {
    return 'https://graph.qq.com/oauth2.0/authorize';
  }

  getAuthUrlParams(state: string): Record<string, string> {
    return { response_type: 'code', state };
  }

  /**
   * POST https://graph.qq.com/oauth2.0/token
   * 使用授权码换取 access_token
   *
   * QQ 特殊性：
   *   - 默认返回 URL 编码格式，需添加 fmt=json 获取 JSON
   *   - 请求体使用 application/x-www-form-urlencoded 格式
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenData> {
    try {
      const { data } = await axios.post<QQTokenResponse>(
        'https://graph.qq.com/oauth2.0/token',
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          redirect_uri: this.config.redirectUri,
          fmt: 'json',
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
   * 后置钩子：获取 OpenID（QQ 特有步骤）
   *
   * OpenID 是用户在当前应用下的唯一标识，必须先获取才能调用用户信息接口。
   */
  protected async afterTokenExchange(
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const openIdResponse = await this.fetchOpenID(accessToken);
    this.logger.log(`获取 OpenID 成功: ${openIdResponse.openid}`);
    return { openId: openIdResponse.openid };
  }

  /**
   * GET https://graph.qq.com/user/get_user_info
   * 使用 access_token + openid 获取已授权用户信息
   */
  async fetchUserInfo(
    accessToken: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const openId = context.openId as string;
    try {
      const { data } = await axios.get<QQUserResponse>(
        'https://graph.qq.com/user/get_user_info',
        {
          params: {
            access_token: accessToken,
            oauth_consumer_key: this.config.clientId,
            openid: openId,
            format: 'json',
          },
          timeout: 10000,
        },
      );

      if (data.ret !== 0) {
        throw new BadRequestException(
          `获取 QQ 用户信息失败: ${data.msg} (ret=${data.ret})`,
        );
      }

      this.logger.log(`获取 QQ 用户信息成功: ${data.nickname}`);
      return data as unknown as Record<string, unknown>;
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

  buildFindOrCreateParams(
    accessToken: string,
    tokenData: OAuthTokenData,
    userInfo: Record<string, unknown>,
    context: Record<string, unknown>,
  ): FindOrCreateOAuthUserParams {
    const qqUser = userInfo as unknown as QQUserResponse;
    return {
      platform: this.platformName,
      platformUserId: context.openId as string,
      accessToken,
      refreshToken: tokenData.refresh_token || undefined,
      tokenExpiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : undefined,
      nickname: qqUser.nickname,
      avatarUrl:
        qqUser.figureurl_qq || qqUser.figureurl_qq_2 || qqUser.figureurl,
      profileUrl: undefined,
      email: undefined,
    };
  }

  /**
   * POST https://graph.qq.com/oauth2.0/token
   * 使用 refresh_token 续期 access_token
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokenData> {
    try {
      const { data } = await axios.post<QQTokenResponse>(
        'https://graph.qq.com/oauth2.0/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          fmt: 'json',
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
        throw new BadRequestException('QQ 令牌刷新失败：返回的令牌为空');
      }

      return data;
    } catch (error: unknown) {
      const axiosError = error as {
        response?: { data?: unknown };
        message?: string;
      };
      this.logger.error(
        `QQ 令牌刷新失败: ${JSON.stringify(axiosError.response?.data || axiosError.message)}`,
      );
      throw new BadRequestException('令牌刷新失败，请重新授权');
    }
  }

  // ───────────────────── 私有方法 ─────────────────────

  /**
   * GET https://graph.qq.com/oauth2.0/me
   * 使用 access_token 获取用户 OpenID
   *
   * 特殊处理：
   *   - 需要 fmt=json 参数，否则返回 JSONP 格式
   *   - 兼容 JSONP callback(...) 格式的响应
   */
  private async fetchOpenID(accessToken: string): Promise<QQOpenIDResponse> {
    try {
      const { data } = await axios.get<string | QQOpenIDResponse>(
        'https://graph.qq.com/oauth2.0/me',
        {
          params: {
            access_token: accessToken,
            fmt: 'json',
          },
          timeout: 10000,
        },
      );

      let parsed: QQOpenIDResponse;
      if (typeof data === 'string') {
        // 兼容 JSONP callback(...) 格式，使用非贪婪匹配
        const jsonMatch = (data as string).match(/callback\(\s*({.*?})\s*\)/);
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
}
