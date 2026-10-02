import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';
import helmet from 'helmet';

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
