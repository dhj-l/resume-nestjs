import { NestFactory } from '@nestjs/core';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { VercelRequest, VercelResponse } from '@vercel/node';
import { join } from 'path';
import { AppModule } from './app.module';

let app: INestApplication;

async function bootstrap() {
  if (!app) {
    app = await NestFactory.create<NestExpressApplication>(AppModule);
    
    // 开启跨域
    app.enableCors();

    // 配置静态资源服务（Vercel 不支持本地文件存储，需要使用对象存储）
    // app.useStaticAssets(join(process.cwd(), 'uploads'), {
    //   prefix: '/uploads/',
    // });

    app.setGlobalPrefix('/api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    
    await app.init();
  }
  return app;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  await bootstrap();
  
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp(req, res);
}
