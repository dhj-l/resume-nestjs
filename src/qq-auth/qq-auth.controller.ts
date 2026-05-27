import { Controller, Get, Query, Req, Res, Logger } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { QQAuthService } from './qq-auth.service';
import { OAuthCallbackDto } from '../common/dto/oauth-callback.dto';
import { redirectOAuthError } from '../common/utils/oauth.util';
import type { Request, Response } from 'express';

/**
 * QQ OAuth 认证控制器
 *
 * 路由前缀: /api/v1/auth/qq（全局前缀 /api/v1 + 控制器前缀 auth/qq）
 */
@Controller('auth/qq')
export class QQAuthController {
  private readonly logger = new Logger(QQAuthController.name);

  constructor(private readonly qqAuthService: QQAuthService) {}

  /**
   * 发起 QQ OAuth 授权
   *
   * GET /api/v1/auth/qq
   *
   * 返回 QQ 授权页面 URL，前端收到后应重定向用户到此地址。
   * 返回格式:
   *   { authUrl: "https://graph.qq.com/oauth2.0/authorize?...", state: "..." }
   *
   * 使用方式（前端）:
   *   const res = await fetch('/api/v1/auth/qq');
   *   const { authUrl } = await res.json();
   *   window.location.href = authUrl;
   */
  @Get()
  getAuthUrl(): { authUrl: string; state: string } {
    this.logger.log('收到 QQ OAuth 授权请求');
    return this.qqAuthService.getAuthUrl();
  }

  /**
   * QQ OAuth 回调处理
   *
   * GET /api/v1/auth/qq/callback?code=xxx&state=yyy
   *
   * 这是 QQ 授权成功后重定向回来的地址（在 QQ 互联应用设置中配置）。
   * 验证授权码、签发 JWT 后，302 重定向到前端回调页（QQ_FRONTEND_CALLBACK_URL），
   * token 通过 URL fragment（#token=xxx）传递，不会出现在服务器日志中。
   *
   * 前端接收方式:
   *   // 在 QQCallbackPage 中:
   *   const hash = window.location.hash.substring(1); // token=eyJ...
   *   const params = new URLSearchParams(hash);
   *   const token = params.get('token');
   *   localStorage.setItem('token', token);
   *   window.location.href = '/home';
   *
   * 速率限制：60 秒内最多 10 次（防止回调和暴力尝试）
   *
   * 错误场景（异常时同样 302 重定向到前端，错误信息通过 URL fragment 传递）:
   *   - state 无效/过期 → 302 重定向 #error=state 参数无效或已过期
   *   - code 无效/过期 → 302 重定向 #error=授权码无效或已过期
   *   - QQ API 异常 → 302 重定向 #error=获取 QQ 用户信息失败
   */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('callback')
  async callback(
    @Query() dto: OAuthCallbackDto,
    @Req() _req: Request,
    @Res() res: Response,
  ): Promise<void> {
    this.logger.log('收到 QQ OAuth 回调');

    try {
      // 处理 OAuth 流程：校验 state → 换 token → 获取 OpenID → 获取用户信息 → 签发 JWT
      const { token } = await this.qqAuthService.handleCallback(
        dto.code,
        dto.state,
      );

      // 构建前端回调 URL，JWT token 通过 URL fragment 传递
      // fragment 不会被发送到服务器，避免 token 出现在日志中
      const frontendUrl = new URL(this.qqAuthService.getFrontendCallbackUrl());
      frontendUrl.hash = `token=${token}`;

      this.logger.log('OAuth 处理完成，302 重定向到前端回调页');
      res.redirect(302, frontendUrl.toString());
    } catch (error: unknown) {
      redirectOAuthError(
        res,
        this.qqAuthService.getFrontendCallbackUrl(),
        error,
        'QQ',
        this.logger,
      );
    }
  }
}
