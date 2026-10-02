import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp, listenOnConfiguredPort } from './bootstrap';
import { winstonLogger } from './common/logger/winston.config';

/* ------------------------------------------------------------------ */
/*  桥接 NestJS Logger → Winston 文件日志                            */
/*  覆盖 prototype 方法，所有 new Logger(...) 实例自动双写。           */
/* ------------------------------------------------------------------ */

function bridgeLoggerToWinston() {
  const levels = ['log', 'error', 'warn', 'debug', 'verbose'] as const;
  for (const level of levels) {
    const orig = (Logger.prototype as any)[level] as (...args: any[]) => any;
    const winstonLevel = level === 'log' ? 'info' : level;

    (Logger.prototype as any)[level] = function (
      message: any,
      ...optionalParams: any[]
    ) {
      // 原始行为：控制台输出
      orig.call(this, message, ...optionalParams);

      // 写文件（携带 context 元数据）
      const winstonMethod = (winstonLogger as any)[winstonLevel] as (
        ...args: any[]
      ) => any;
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

  // 全局 HTTP 配置（前缀 / 安全头 / CORS / 静态资源 / 校验管道）
  // 与 e2e 共用同一份实现，见 src/bootstrap.ts
  configureApp(app);

  const port = await listenOnConfiguredPort(app);
  console.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
