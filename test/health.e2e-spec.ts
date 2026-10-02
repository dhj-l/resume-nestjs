import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * e2e 主接缝的冒烟用例：启动真实的 AppModule（含真实 MongoDB 测试库），
 * 并施加与生产完全相同的全局前缀 / ValidationPipe / 拦截器 / 过滤器。
 *
 * 这条用例同时守住两件事：
 * 1. e2e 基础设施本身可用（此前 jest-e2e.json 缺 moduleNameMapper，
 *    pnpm test:e2e 直接报 Cannot find module 'src/...'）。
 * 2. 全局前缀 /api/v1 与统一响应包络确实生效。
 */
describe('健康检查 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('GET /api/v1/health 返回 200，且响应被统一包络包装', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200);

    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('操作成功');
    expect(res.body.path).toBe('/api/v1/health');
    expect(res.body.data.database).toBe('connected');
  });

  it('未加全局前缀的路径返回 404，证明前缀确实生效', async () => {
    await request(app.getHttpServer()).get('/health').expect(404);
  });

  it('GET /api/v1 仍返回 Hello World!（原骨架用例的等价覆盖）', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1').expect(200);

    expect(res.body.data).toBe('Hello World!');
  });
});
