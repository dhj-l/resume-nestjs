import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import helmet from 'helmet';

/**
 * 解析 TRUST_PROXY 环境变量
 *
 * - 未配置 / false / 0 → false（不信任代理，req.ip 用 socket 地址）
 * - true / 1 / yes      → 1（信任一层代理，取 X-Forwarded-For 最后一跳）
 * - '2' 等正整数         → 对应跳数
 */
export function parseTrustProxy(raw?: string | null): number | false {
  if (!raw) {
    return false;
  }
  const value = raw.trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(value)) {
    return false;
  }
  if (['true', 'yes', 'on'].includes(value)) {
    return 1;
  }
  const hops = Number(value);
  return Number.isInteger(hops) && hops > 0 ? hops : false;
}

/**
 * 应用级 HTTP 配置（全局前缀、安全头、CORS、静态资源、校验管道）
 *
 * 从 main.ts 抽出，供生产启动与 e2e 共用 —— 否则 e2e 只能自己复制一份管线，
 * 就测不出「全局前缀 / ValidationPipe / 拦截器 / 过滤器」这一层真实行为。
 *
 * @returns 解析出的 CORS 白名单（helmet 的 imgSrc 需要用到）
 */
export function configureApp(app: NestExpressApplication): string[] {
  const config = app.get(ConfigService);

  // 跨域白名单 — 通过 CORS_ORIGINS 环境变量配置，逗号分隔
  const corsOrigins = config
    .get<string>('CORS_ORIGINS')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean) ?? ['http://localhost:5173', 'http://localhost:5174'];

  // 安全 HTTP 头
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:', ...corsOrigins],
        },
      },
    }),
  );

  // 反向代理信任策略：TRUST_PROXY=1/true 时按 X-Forwarded-For 解析真实客户端 IP。
  // 默认关闭，因为本项目当前是客户端直连（如 http://host:3000），req.ip 已是真实 IP；
  // 若全部流量走 nginx 却不开这个开关，所有用户会被算成同一个代理 IP 而互相限流。
  const trustProxy = parseTrustProxy(config.get<string>('TRUST_PROXY'));
  if (trustProxy !== false) {
    app.set('trust proxy', trustProxy);
  }

  app.enableCors({
    origin: corsOrigins,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    credentials: true,
  });

  // 配置静态资源服务
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
  });

  app.setGlobalPrefix('/api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  return corsOrigins;
}

/** 供 main.ts 复用的应用启动辅助（保持与抽取前完全一致的行为） */
export async function listenOnConfiguredPort(
  app: INestApplication,
): Promise<number> {
  const config = app.get(ConfigService);
  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  return port;
}
