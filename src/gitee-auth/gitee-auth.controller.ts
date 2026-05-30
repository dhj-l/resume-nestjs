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
import { GiteeAuthService } from './gitee-auth.service';
import { OAuthCallbackDto } from '../common/dto/oauth-callback.dto';
import { BaseOAuthController } from '../common/oauth/base-oauth.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request, Response } from 'express';

type RequestWithUser = Request & {
  user: { userId: string; username: string; email: string };
};

/**
 * Gitee OAuth 认证控制器
 *
 * 路由前缀: /api/v1/auth/gitee
 */
@Controller('auth/gitee')
export class GiteeAuthController extends BaseOAuthController<GiteeAuthService> {
  readonly platformDisplayName = 'Gitee';

  constructor(authService: GiteeAuthService) {
    super(authService);
  }

  /**
   * 发起 Gitee OAuth 授权
   * GET /api/v1/auth/gitee
   */
  @Get()
  getAuthUrl() {
    return this.handleAuthUrl();
  }

  /**
   * Gitee OAuth 回调处理
   * GET /api/v1/auth/gitee/callback?code=xxx&state=yyy
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
   * 刷新 Gitee OAuth 令牌
   * POST /api/v1/auth/gitee/refresh
   */
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async refresh(@Req() req: RequestWithUser) {
    return this.handleRefreshToken(req.user.userId);
  }
}
