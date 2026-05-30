import { Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * OAuth 回调异常时，302 重定向到前端回调页，错误信息通过 URL fragment 传递
 *
 * @param res Express Response 对象
 * @param frontendCallbackUrl 前端 OAuth 回调页地址
 * @param error 捕获到的异常
 * @param platformName 平台名称（如 'GitHub'、'Gitee'），用于日志和默认错误消息
 * @param logger Logger 实例
 */
export function redirectOAuthError(
  res: Response,
  frontendCallbackUrl: string,
  error: unknown,
  platformName: string,
  logger: Logger,
): void {
  const errorMessage =
    error instanceof Error ? error.message : `${platformName} 登录失败`;
  logger.error(`${platformName} OAuth 回调处理失败: ${errorMessage}`);

  const frontendUrl = new URL(frontendCallbackUrl);
  frontendUrl.hash = `error=${encodeURIComponent(errorMessage)}`;

  res.redirect(302, frontendUrl.toString());
}
