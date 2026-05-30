import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';

/* ------------------------------------------------------------------ */
/*  敏感字段黑名单（请求体中的这些字段会被脱敏）                       */
/* ------------------------------------------------------------------ */

const SENSITIVE_FIELDS = new Set([
  'password',
  'oldPassword',
  'newPassword',
  'accessToken',
  'access_token',
  'refreshToken',
  'refresh_token',
  'token',
  'secret',
  'authorization',
]);

/** 深拷贝后递归脱敏，防止篡改原始对象 */
function sanitizeBody(body: unknown, maxDepth = 3): unknown {
  if (body === null || body === undefined) return body;
  if (typeof body !== 'object') return body;
  if (maxDepth <= 0) return '[object]';

  if (Array.isArray(body)) {
    return body.map((item) => sanitizeBody(item, maxDepth - 1));
  }

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_FIELDS.has(key)) {
      sanitized[key] = '***';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeBody(value, maxDepth - 1);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

/* ------------------------------------------------------------------ */
/*  请求日志拦截器                                                     */
/* ------------------------------------------------------------------ */

/**
 * 全局请求日志拦截器
 *
 * 在请求到达时记录方法/路径/IP/UA，响应返回时记录状态码和耗时。
 * 请求体自动脱敏（密码/token 等字段替换为 ***），超长内容截断。
 *
 * 注册方式：在 AppModule providers 中添加
 *   { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor }
 *
 * 顺序注意：本拦截器应在 ResponseInterceptor **之前**执行，
 * 因此 APP_INTERCEPTOR 数组中应排在 ResponseInterceptor 前面。
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  /** 请求体最大记录长度（字符），超出部分截断 */
  private readonly maxBodyLength = 2000;

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest<Request>();
    const startTime = Date.now();

    // 提取请求元信息
    const method = request.method;
    const url = request.originalUrl || request.url;
    const ip =
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      request.ip ||
      (request as any).connection?.remoteAddress ||
      'unknown';
    const userAgent = this.truncate(request.headers['user-agent'] || '-', 120);
    const userId = (request as any).user?.userId || null;

    // 请求体日志（脱敏 + 截断）
    const bodyLog = this.formatBody(request.body);

    const userPart = userId ? `uid=${userId} ` : '';

    this.logger.log(
      `→ ${method} ${url} | ${userPart}ip=${ip} | ua="${userAgent}"${bodyLog}`,
    );

    return next.handle().pipe(
      tap({
        next: (_data: unknown) => {
          const response = ctx.getResponse<Response>();
          const duration = Date.now() - startTime;
          const statusCode = response.statusCode;

          const msg = `← ${method} ${url} | ${userPart}${statusCode} | ${duration}ms`;
          if (statusCode >= 400) {
            this.logger.warn(msg);
          } else {
            this.logger.log(msg);
          }
        },
        error: (error: Error & { status?: number }) => {
          const duration = Date.now() - startTime;
          const statusCode = error.status || 500;

          this.logger.error(
            `← ${method} ${url} | ${userPart}${statusCode} | ${duration}ms | ${error.message}`,
          );
        },
      }),
    );
  }

  /* ------------------------------------------------------------------ */
  /*  辅助方法                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * 格式化请求体用于日志
   * - 脱敏敏感字段
   * - 超长内容截断
   * - 空值不输出
   */
  private formatBody(body: unknown): string {
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      return '';
    }

    const sanitized = sanitizeBody(body);
    let json: string;

    try {
      json = JSON.stringify(sanitized);
    } catch {
      return ' [body=<unserializable>]';
    }

    if (json === '{}') return '';

    const truncated = this.truncate(json, this.maxBodyLength);
    const suffix = json.length > this.maxBodyLength ? '…' : '';
    return ` | body=${truncated}${suffix}`;
  }

  private truncate(value: string, maxLen: number): string {
    if (value.length <= maxLen) return value;
    return value.substring(0, maxLen);
  }
}
