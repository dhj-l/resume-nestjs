import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';
import { BaseOAuthService } from '../common/oauth/base-oauth.service';
import type {
  OAuthTokenData,
  FindOrCreateOAuthUserParams,
} from '../common/oauth/oauth.types';
import {
  GitHubTokenResponse,
  GitHubUserResponse,
  GitHubEmailEntry,
} from './interfaces/github-api.interface';

/**
 * GitHub OAuth 认证服务
 *
 * 继承 BaseOAuthService，仅实现 GitHub 平台差异化的逻辑。
 *
 * 特殊性：
 *   - Token 默认不过期（无 expires_in / refresh_token）
 *   - API 要求 User-Agent header
 *   - 通过 /user/emails API 获取已验证邮箱用于安全的账户匹配
 */
@Injectable()
export class GitHubAuthService extends BaseOAuthService {
  readonly platformName = 'github';

  // ───────────────────── 抽象方法实现 ─────────────────────

  getConfigPrefix(): string {
    return 'GITHUB';
  }

  protected getDefaultScope(): string {
    return 'read:user user:email';
  }

  getAuthorizeUrl(): string {
    return 'https://github.com/login/oauth/authorize';
  }

  getAuthUrlParams(state: string): Record<string, string> {
    // GitHub 不需要 response_type 参数
    return { state };
  }

  /**
   * POST https://github.com/login/oauth/access_token
   * 使用授权码换取 access_token
   */
  async exchangeCodeForToken(code: string): Promise<OAuthTokenData> {
    try {
      const { data } = await axios.post<GitHubTokenResponse>(
        'https://github.com/login/oauth/access_token',
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
   * 后置钩子：并行获取 GitHub 用户信息和已验证邮箱
   *
   * GitHub 需要额外调用 /user/emails 获取已验证邮箱，
   * 与 /user 并行发起以减少总耗时。
   */
  protected async afterTokenExchange(
    accessToken: string,
  ): Promise<Record<string, unknown>> {
    const [githubUser, verifiedEmail] = await Promise.all([
      this.fetchGitHubUser(accessToken),
      this.fetchGitHubVerifiedEmail(accessToken),
    ]);

    this.logger.log(
      `获取 GitHub 用户信息成功: ${githubUser.login} (ID: ${githubUser.id})`,
    );
    if (verifiedEmail) {
      this.logger.log(`获取到 GitHub 已验证邮箱: ${verifiedEmail}`);
    }

    return { githubUser, verifiedEmail };
  }

  /**
   * 获取用户信息（已在 afterTokenExchange 中获取，直接从 context 返回）
   */
  async fetchUserInfo(
    _accessToken: string,
    context: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return context.githubUser as Record<string, unknown>;
  }

  buildFindOrCreateParams(
    accessToken: string,
    _tokenData: OAuthTokenData,
    userInfo: Record<string, unknown>,
    context: Record<string, unknown>,
  ): FindOrCreateOAuthUserParams {
    const githubUser = userInfo as unknown as GitHubUserResponse;
    return {
      platform: this.platformName,
      platformUserId: String(githubUser.id),
      accessToken,
      refreshToken: undefined,
      tokenExpiresAt: undefined,
      nickname: githubUser.name || githubUser.login,
      avatarUrl: githubUser.avatar_url,
      profileUrl: githubUser.html_url,
      email: githubUser.email || undefined,
      verifiedEmail: context.verifiedEmail as string | undefined,
    };
  }

  /**
   * GitHub tokens 默认不过期且不支持 refresh_token
   */
  async refreshAccessToken(_refreshToken: string): Promise<OAuthTokenData> {
    throw new BadRequestException(
      'GitHub 令牌默认不过期，不支持刷新。如需更新令牌，请重新授权。',
    );
  }

  // ───────────────────── 私有方法 ─────────────────────

  /**
   * GET https://api.github.com/user
   * 使用 access_token 获取已授权用户信息
   */
  private async fetchGitHubUser(
    accessToken: string,
  ): Promise<GitHubUserResponse> {
    try {
      const { data } = await axios.get<GitHubUserResponse>(
        'https://api.github.com/user',
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
   * 仅返回经过 GitHub 验证（verified: true）且为主邮箱（primary: true）的地址。
   * 获取失败时降级为不使用邮箱匹配（不阻断 OAuth 流程）。
   */
  private async fetchGitHubVerifiedEmail(
    accessToken: string,
  ): Promise<string | undefined> {
    try {
      const { data } = await axios.get<GitHubEmailEntry[]>(
        'https://api.github.com/user/emails',
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'resume-nestjs-app',
          },
          timeout: 10000,
        },
      );

      const primaryVerified = data.find((e) => e.verified && e.primary);
      if (primaryVerified) {
        return primaryVerified.email;
      }

      const anyVerified = data.find((e) => e.verified);
      return anyVerified?.email;
    } catch (error: unknown) {
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
