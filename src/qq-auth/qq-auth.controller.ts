import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QQAuthService } from './qq-auth.service';
import { OAuthCallbackDto } from '../common/dto/oauth-callback.dto';
import { BaseOAuthController } from '../common/oauth/base-oauth.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request, Response } from 'express';

type RequestWithUser = Request & {
  user: { userId: string; username: string; email: string };
};

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

  /**
   * 刷新 QQ OAuth 令牌
   * POST /api/v1/auth/qq/refresh
   */
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async refresh(@Req() req: RequestWithUser) {
    return this.handleRefreshToken(req.user.userId);
  }
}
