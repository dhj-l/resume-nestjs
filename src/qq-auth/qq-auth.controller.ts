import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QQAuthService } from './qq-auth.service';
import { OAuthCallbackDto } from '../common/dto/oauth-callback.dto';
import { BaseOAuthController } from '../common/oauth/base-oauth.controller';
import type { Request, Response } from 'express';

/**
 * QQ OAuth 认证控制器
 *
 * 路由前缀: /api/v1/auth/qq
 */
@Controller('auth/qq')
export class QQAuthController extends BaseOAuthController<QQAuthService> {
  readonly platformDisplayName = 'QQ';

  constructor(authService: QQAuthService) {
    super(authService);
  }

  /**
   * 发起 QQ OAuth 授权
   * GET /api/v1/auth/qq
   */
  @Get()
  getAuthUrl() {
    return this.handleAuthUrl();
  }

  /**
   * QQ OAuth 回调处理
   * GET /api/v1/auth/qq/callback?code=xxx&state=yyy
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('callback')
  async callback(
    @Query() dto: OAuthCallbackDto,
    @Req() _req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.handleCallback(dto, res);
  }
}
