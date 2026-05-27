import { BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { BaseOAuthService } from '../common/oauth/base-oauth.service';
import type {
  OAuthTokenData,
  FindOrCreateOAuthUserParams,
} from '../common/oauth/oauth.types';
import {
  GiteeTokenResponse,
  GiteeUserResponse,
} from './interfaces/gitee-api.interface';

/**
 * Gitee OAuth 认证服务
 *
 * 继承 BaseOAuthService，仅实现 Gitee 平台差异化的逻辑。
 */
export class GiteeAuthService extends BaseOAuthService {
  readonly platformName = 'gitee';

  // ───────────────────── 抽象方法实现 ─────────────────────

  getConfigPrefix(): string {
    return 'GITEE';
  }

  protected getDefaultScope(): string {
    return 'user_info';
  }

  getAuthorizeUrl(): string {
    return 'https://gitee.com/oauth/authorize';
  }

  getAuthUrlParams(state: string): Record<string, string> {
    return { response_type: 'code', state };
  }

  /**
   * POST https://gitee.com/oauth/token
   * 使用授权码换取 access_token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenData> {
    try {
      const { data } = await axios.post<GiteeTokenResponse>(
        'https://gitee.com/oauth/token',
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
  async fetchUserInfo(
    accessToken: string,
    _context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    try {
      const { data } = await axios.get<GiteeUserResponse>(
        'https://gitee.com/api/v5/user',
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

      return data as unknown as Record<string, unknown>;
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

  buildFindOrCreateParams(
    accessToken: string,
    tokenData: OAuthTokenData,
    userInfo: Record<string, unknown>,
    _context: Record<string, unknown>,
  ): FindOrCreateOAuthUserParams {
    const giteeUser = userInfo as unknown as GiteeUserResponse;
    return {
      platform: this.platformName,
      platformUserId: String(giteeUser.id),
      accessToken,
      refreshToken: tokenData.refresh_token || undefined,
      tokenExpiresAt: tokenData.expires_in
        ? new Date(Date.now() + tokenData.expires_in * 1000)
        : undefined,
      nickname: giteeUser.name || giteeUser.login,
      avatarUrl: giteeUser.avatar_url,
      profileUrl: giteeUser.html_url,
      email: giteeUser.email || undefined,
    };
  }
}
