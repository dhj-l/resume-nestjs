import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authed, E2eUser, registerAndLogin } from './helpers/auth';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * P0-4 回归：全局限流必须真的生效。
 *
 * 修复前 ThrottlerModule 只注册了模块，APP_GUARD 从未注册，仓库里也搜不到
 * ThrottlerGuard —— 6 处 @Throttle 装饰器全是死代码，登录接口没有防爆破，
 * AI / PDF 等昂贵端点可被无限调用。
 *
 * 桶的粒度：@nestjs/throttler v6 的 key = hash(控制器-方法-限流器名-tracker)，
 * 即「每个路由处理器 × 每个计数主体」一个桶。因此：
 * - 已登录用户在每个端点上各有 THROTTLE_LIMIT 次额度；
 * - 未认证请求按 IP 计数（登录/注册/OAuth 回调）；
 * - 不同用户之间互不影响（这正是「不影响正常用户」的关键）。
 */
const LIMIT = 3;

describe('全局限流 (e2e)', () => {
  let app: INestApplication;
  let alice: E2eUser;
  let bob: E2eUser;

  beforeAll(async () => {
    app = await createE2eApp({
      THROTTLE_LIMIT: String(LIMIT),
      THROTTLE_TTL_MS: '60000',
    });
    alice = await registerAndLogin(app, 'alice@e2e.test', 'e2ealice');
    bob = await registerAndLogin(app, 'bob@e2e.test', 'e2ebob');
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('未认证请求按 IP 计数：额度内放行，超出返回 429', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    }

    const blocked = await request(app.getHttpServer()).get('/api/v1/health');
    expect(blocked.status).toBe(429);
    // 统一响应包络不能被绕过
    expect(blocked.body.code).toBe(429);
    expect(blocked.body.path).toBe('/api/v1/health');
  });

  it('已登录请求按 userId 计数：额度内放行，超出返回 429', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      await authed(app, alice.token).get('/api/v1/user/profile').expect(200);
    }

    await authed(app, alice.token).get('/api/v1/user/profile').expect(429);
  });

  it('限流按用户隔离：alice 被限流不影响 bob', async () => {
    await authed(app, bob.token).get('/api/v1/user/profile').expect(200);
  });

  it('不同路由各自独立计数，不会因为访问别的接口被连带限流', async () => {
    // alice 在 profile 上已被限流，但 /user/:id（另一个 handler）仍是独立桶
    await authed(app, alice.token)
      .get(`/api/v1/user/${alice.userId}`)
      .expect(200);
  });
});
