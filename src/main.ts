import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ValidationPipe, Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import { winstonLogger } from './common/logger/winston.config';

/* ------------------------------------------------------------------ */
/*  桥接 NestJS Logger → Winston 文件日志                            */
/*  覆盖 prototype 方法，所有 new Logger(...) 实例自动双写。           */
/* ------------------------------------------------------------------ */

function bridgeLoggerToWinston() {
  const levels = ['log', 'error', 'warn', 'debug', 'verbose'] as const;
  for (const level of levels) {
    const orig = (Logger.prototype as any)[level] as Function;
    const winstonLevel = level === 'log' ? 'info' : level;

    (Logger.prototype as any)[level] = function (
      message: any,
      ...optionalParams: any[]
    ) {
      // 原始行为：控制台输出
      orig.call(this, message, ...optionalParams);

      // 写文件（携带 context 元数据）
      const winstonMethod = (winstonLogger as any)[winstonLevel] as Function;
      const meta: Record<string, unknown> = {};
      if (this.context) meta.context = this.context;
      // error 特有：第二个参数可能是 stack trace
      if (level === 'error' && optionalParams.length > 0) {
        meta.stack = optionalParams[0];
      }
      winstonMethod.call(winstonLogger, String(message), meta);
    };
  }
}

bridgeLoggerToWinston();

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
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

  const port = config.get<number>('PORT') ?? 3000;
  await app.listen(port);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
