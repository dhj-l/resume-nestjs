import { INestApplication } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import mongoose from 'mongoose';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/bootstrap';
import { assertTestDatabase, resetE2eEnv } from './test-env';

/**
 * e2e 应用工厂：真实 AppModule + 真实 MongoDB（独立测试库）+ 与生产一致的
 * 全局 HTTP 管线（src/bootstrap.ts 的 configureApp）。
 *
 * 每个用例文件都从「干净的空库」开始：先 drop 测试库，再创建应用。
 * 顺序很重要——autoIndex 在模型初始化时建索引，先建应用再 drop 会把索引一起删掉。
 */
export async function createE2eApp(
  envOverrides: Record<string, string> = {},
): Promise<INestApplication> {
  resetE2eEnv(envOverrides);

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI 未设置，无法创建 e2e 应用');
  }
  assertTestDatabase(uri);
  await dropDatabase(uri);

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

export async function closeE2eApp(app?: INestApplication): Promise<void> {
  if (app) {
    await app.close();
  }
}

/** 清空测试库（库名必须形如 *-e2e，见 assertTestDatabase） */
export async function dropDatabase(uri: string): Promise<void> {
  const connection = await mongoose.createConnection(uri).asPromise();
  try {
    await connection.dropDatabase();
  } finally {
    await connection.close();
  }
}
