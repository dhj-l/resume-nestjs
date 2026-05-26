import { Controller, Get, Query, Req, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { GiteeAuthService } from './gitee-auth.service';
import { GiteeCallbackDto } from './dto/gitee-callback.dto';
import type { Request } from 'express';

/**
 * Gitee OAuth 认证控制器
 *
 * 路由前缀: /api/v1/auth/gitee（全局前缀 /api/v1 + 控制器前缀 auth/gitee）
 */
@Controller('auth/gitee')
export class GiteeAuthController {
  private readonly logger = new Logger(GiteeAuthController.name);

  constructor(private readonly giteeAuthService: GiteeAuthService) {}

  /**
   * 发起 Gitee OAuth 授权
   *
   * GET /api/v1/auth/gitee
   *
   * 返回 Gitee 授权页面 URL，前端收到后应重定向用户到此地址。
   * 返回格式:
   *   { authUrl: "https://gitee.com/oauth/authorize?...", state: "..." }
   *
   * 使用方式（前端）:
   *   const res = await fetch('/api/v1/auth/gitee');
   *   const { authUrl } = await res.json();
   *   window.location.href = authUrl;
   */
  @Get()
  getAuthUrl(): { authUrl: string; state: string } {
    this.logger.log('收到 Gitee OAuth 授权请求');
    return this.giteeAuthService.getAuthUrl();
  }

  /**
   * Gitee OAuth 回调处理
   *
   * GET /api/v1/auth/gitee/callback?code=xxx&state=yyy
   *
   * 这是 Gitee 授权成功后重定向回来的地址（在 Gitee 应用设置中配置）。
   * 验证授权码后返回 JWT token 和用户信息。
   *
   * 速率限制：60 秒内最多 10 次（防止回调和暴力尝试）
   *
   * 返回格式:
   *   { token: "eyJ...", user: { _id, username, email, oauthProviders, ... } }
   *
   * 错误场景:
   *   - state 无效/过期 → 400 "state 参数无效或已过期"
   *   - code 无效/过期 → 400 "授权码无效或已过期"
   *   - Gitee API 异常 → 400 "获取 Gitee 用户信息失败"
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('callback')
  async callback(
    @Query() dto: GiteeCallbackDto,
    @Req() _req: Request,
  ): Promise<{ token: string; user: Record<string, unknown> }> {
    this.logger.log('收到 Gitee OAuth 回调');
    return this.giteeAuthService.handleCallback(dto.code, dto.state);
  }
}
