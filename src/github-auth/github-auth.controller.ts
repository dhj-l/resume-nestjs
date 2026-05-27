import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GitHubAuthService } from './github-auth.service';
import { OAuthCallbackDto } from '../common/dto/oauth-callback.dto';
import { BaseOAuthController } from '../common/oauth/base-oauth.controller';
import type { Request, Response } from 'express';

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
}
