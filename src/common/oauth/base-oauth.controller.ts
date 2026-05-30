import { Logger } from '@nestjs/common';
import { redirectOAuthError } from '../utils/oauth.util';
import { OAuthCallbackDto } from '../dto/oauth-callback.dto';
import type { Response } from 'express';
import type { BaseOAuthService } from './base-oauth.service';

/**
 * OAuth 控制器抽象基类
 *
 * 提供 OAuth 授权和回调处理的通用逻辑。
 * 子类保留 @Controller / @Get / @Throttle 等装饰器，方法体委托给基类。
 *
 * 注意：NestJS 的路由装饰器必须在具体类的方法上，
 * 因此基类提供 protected 方法而非直接定义路由方法。
 */
export abstract class BaseOAuthController<T extends BaseOAuthService> {
  protected readonly logger: Logger;

  /** 平台显示名称（如 'Gitee'、'GitHub'、'QQ'），用于日志和错误消息 */
  abstract readonly platformDisplayName: string;

  constructor(protected readonly authService: T) {
    this.logger = new Logger(this.constructor.name);
  }

  /**
   * 处理授权请求：返回 OAuth 授权页 URL
   */
  protected handleAuthUrl(): { authUrl: string; state: string } {
    this.logger.log(`收到 ${this.platformDisplayName} OAuth 授权请求`);
    return this.authService.getAuthUrl();
  }

  /**
   * 处理 OAuth 回调：校验 → 签发 JWT → 重定向到前端
   *
   * 成功时 302 重定向，token 通过 URL fragment 传递（#token=xxx）。
   * 失败时同样 302 重定向，错误信息通过 fragment 传递（#error=xxx）。
   */
  protected async handleCallback(
    dto: OAuthCallbackDto,
    res: Response,
  ): Promise<void> {
    this.logger.log(`收到 ${this.platformDisplayName} OAuth 回调`);

    try {
      const { token } = await this.authService.handleCallback(
        dto.code,
        dto.state,
      );

      const frontendUrl = new URL(this.authService.getFrontendCallbackUrl());
      frontendUrl.hash = `token=${token}`;

      this.logger.log('OAuth 处理完成，302 重定向到前端回调页');
      res.redirect(302, frontendUrl.toString());
    } catch (error: unknown) {
      redirectOAuthError(
        res,
        this.authService.getFrontendCallbackUrl(),
        error,
        this.platformDisplayName,
        this.logger,
      );
    }
  }

  /**
   * 处理令牌刷新请求
   */
  protected async handleRefreshToken(
    userId: string,
  ): Promise<{ tokenExpiresAt?: Date }> {
    this.logger.log(`收到 ${this.platformDisplayName} 令牌刷新请求`);
    return this.authService.refreshUserToken(userId);
  }
}
