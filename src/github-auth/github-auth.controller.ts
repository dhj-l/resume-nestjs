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
import { GitHubAuthService } from './github-auth.service';
import { OAuthCallbackDto } from '../common/dto/oauth-callback.dto';
import { BaseOAuthController } from '../common/oauth/base-oauth.controller';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { Request, Response } from 'express';

type RequestWithUser = Request & {
  user: { userId: string; username: string; email: string };
};

/**
 * GitHub OAuth 认证控制器
 *
 * 路由前缀: /api/v1/auth/github
 */
@Controller('auth/github')
export class GitHubAuthController extends BaseOAuthController<GitHubAuthService> {
  readonly platformDisplayName = 'GitHub';

  constructor(authService: GitHubAuthService) {
    super(authService);
  }

  /**
   * 发起 GitHub OAuth 授权
   * GET /api/v1/auth/github
   */
  @Get()
  getAuthUrl() {
    return this.handleAuthUrl();
  }

  /**
   * GitHub OAuth 回调处理
   * GET /api/v1/auth/github/callback?code=xxx&state=yyy
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
   * 刷新 GitHub OAuth 令牌（GitHub token 默认不过期，返回提示信息）
   * POST /api/v1/auth/github/refresh
   */
  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  async refresh(@Req() req: RequestWithUser) {
    return this.handleRefreshToken(req.user.userId);
  }
}
