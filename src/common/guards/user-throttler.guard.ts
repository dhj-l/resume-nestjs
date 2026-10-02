import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ThrottlerGuard } from '@nestjs/throttler';
// 这两个只在类型位置使用：基类已用 @InjectThrottlerOptions/@InjectThrottlerStorage
// 显式声明注入 token，因此这里用 import type 满足 isolatedModules +
// emitDecoratorMetadata 的要求（否则报 TS1272）。
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

/**
 * 全局限流守卫（P0-4）
 *
 * 背景：`@nestjs/throttler` 必须显式挂载守卫才会生效。此前只注册了
 * ThrottlerModule，仓库里既没有 APP_GUARD 也搜不到 ThrottlerGuard，
 * 控制器上的 @Throttle 全是死代码。
 *
 * 计数维度（这是「不影响正常用户」的关键）：
 * - 已登录 → 按 userId 计数。默认按 IP 会让公司 NAT / 校园网后面的所有用户
 *   挤在同一个桶里互相误伤。
 * - 未认证 → 按 IP 计数，这才符合登录爆破防护的语义。
 *
 * 为什么需要自己验签 JWT：全局 APP_GUARD 先于路由级 JwtAuthGuard 执行，
 * 此刻 req.user 还没有被 Passport 填充。不验签就只能按 IP 计数，或者被
 * 伪造的 token 主体绕过限流（因此不能只 base64 解码）。
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  constructor(
    options: ThrottlerModuleOptions,
    storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {
    super(options, storageService, reflector);
  }

  protected async getTracker(req: Record<string, any>): Promise<string> {
    const resolvedUserId = req?.user?.userId ?? this.userIdFromBearer(req);
    if (resolvedUserId) {
      return `user:${String(resolvedUserId)}`;
    }
    return `ip:${req?.ip ?? 'unknown'}`;
  }

  /** 从 Authorization 头验签取出 userId；失败一律回退 null（按 IP 计数） */
  private userIdFromBearer(req: Record<string, any>): string | null {
    const header = req?.headers?.authorization;
    if (typeof header !== 'string') {
      return null;
    }
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return null;
    }

    try {
      const payload = this.jwtService.verify<{ userId?: unknown }>(
        token.trim(),
      );
      return payload?.userId ? String(payload.userId) : null;
    } catch {
      // 过期/伪造/密钥不匹配：交给 JwtAuthGuard 去拒绝，这里只做限流归属
      return null;
    }
  }
}
