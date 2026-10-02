import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 解析 ADMIN_EMAILS 环境变量
 *
 * 规则：按逗号切分、trim、转小写、丢弃空项、去重。
 * 未配置 / 空串 → 返回空数组（调用方据此 fail closed）。
 */
export function parseAdminEmails(raw?: string | null): string[] {
  if (!raw) {
    return [];
  }
  const emails = new Set<string>();
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase();
    if (email) {
      emails.add(email);
    }
  }
  return [...emails];
}

/**
 * 判断给定邮箱是否为管理员邮箱
 *
 * @param email 当前登录用户的邮箱（req.user.email）
 * @param raw   ADMIN_EMAILS 原始值
 */
export function isAdminEmail(email: unknown, raw?: string | null): boolean {
  if (typeof email !== 'string' || !email.trim()) {
    return false;
  }
  return parseAdminEmails(raw).includes(email.trim().toLowerCase());
}

/**
 * 管理员鉴权守卫
 *
 * 管理员身份来源是环境变量 ADMIN_EMAILS（逗号分隔的邮箱白名单），
 * 不做数据库角色字段，因此改完重启即生效、可随时回滚。
 *
 * 安全语义：
 * - 必须在 JwtAuthGuard 之后使用（依赖 req.user）；
 * - ADMIN_EMAILS 未配置 → 一律 403（fail closed），不会因漏配而放开管理端。
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private warnedEmpty = false;

  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const adminEmails = this.config.get<string>('ADMIN_EMAILS');

    if (!adminEmails?.trim() && !this.warnedEmpty) {
      this.warnedEmpty = true;
      this.logger.warn(
        'ADMIN_EMAILS 未配置，所有管理端请求都会被拒绝（如需管理后台请配置该环境变量）',
      );
    }

    if (!isAdminEmail(request?.user?.email, adminEmails)) {
      throw new ForbiddenException('没有权限访问该资源');
    }
    return true;
  }
}
