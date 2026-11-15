import { INestApplication } from '@nestjs/common';
import { getConnectionToken } from '@nestjs/mongoose';
import type { Connection } from 'mongoose';
import request from 'supertest';
import { authed, E2eUser, registerAndLogin } from './helpers/auth';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * P0-3 回归：用户数据不能越权读取，也不能把凭据带出。
 *
 * 修复前：GET /user 只挂 JwtAuthGuard，任何登录用户都能分页枚举全站用户，
 * 而 findAll 只 .select('-password')，oauthProviders.accessToken /
 * refreshToken 一并返回；remove 更会把 bcrypt 哈希一起返回。
 */
const ADMIN_EMAIL = 'admin@e2e.test';
const ALICE_EMAIL = 'alice@e2e.test';
const BOB_EMAIL = 'bob@e2e.test';

/** 断言响应体任何层级都不含令牌/密码字段 */
function expectNoCredentials(payload: unknown): void {
  const serialized = JSON.stringify(payload);
  for (const forbidden of [
    'accessToken',
    'refreshToken',
    'tokenExpiresAt',
    '"password"',
    'cipher-access',
    'cipher-refresh',
  ]) {
    expect(`${forbidden} present? ${serialized.includes(forbidden)}`).toBe(
      `${forbidden} present? false`,
    );
  }
}

describe('用户隐私与用户列表鉴权 (e2e)', () => {
  let app: INestApplication;
  let admin: E2eUser;
  let alice: E2eUser;
  let bob: E2eUser;
  let oauthUserId: string;

  beforeAll(async () => {
    app = await createE2eApp({ ADMIN_EMAILS: ADMIN_EMAIL });
    admin = await registerAndLogin(app, ADMIN_EMAIL, 'e2eadmin');
    alice = await registerAndLogin(app, ALICE_EMAIL, 'e2ealice');
    bob = await registerAndLogin(app, BOB_EMAIL, 'e2ebob');

    // 直接写入一个带 OAuth 令牌的用户，用来验证真实 HTTP 序列化路径
    const connection = app.get<Connection>(getConnectionToken());
    const created = await connection.model('User').create({
      username: 'oauthuser',
      email: 'oauth@e2e.test',
      createdVia: 'github',
      oauthProviders: [
        {
          platform: 'github',
          platformUserId: '42',
          accessToken: 'cipher-access',
          refreshToken: 'cipher-refresh',
          tokenExpiresAt: new Date('2030-01-01T00:00:00.000Z'),
          nickname: 'OAuth User',
          avatarUrl: 'https://example.com/a.png',
        },
      ],
    });
    oauthUserId = String(created._id);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('普通用户访问用户列表 GET /user 返回 403', async () => {
    await authed(app, alice.token).get('/api/v1/user').expect(403);
  });

  it('管理员访问用户列表 GET /user 返回 200', async () => {
    const res = await authed(app, admin.token).get('/api/v1/user').expect(200);

    expect(Array.isArray(res.body.data.items)).toBe(true);
    expect(res.body.data.items.length).toBeGreaterThanOrEqual(4);
  });

  it('管理员拉取的用户列表里不含任何 OAuth 令牌，但保留平台展示字段', async () => {
    const res = await authed(app, admin.token)
      .get('/api/v1/user?keyword=oauth@e2e.test')
      .expect(200);

    expect(res.body.data.items).toHaveLength(1);
    const item = res.body.data.items[0];
    expectNoCredentials(res.body);

    // 展示字段保留，避免打断账号绑定页
    expect(item.username).toBe('oauthuser');
    expect(item.oauthProviders).toHaveLength(1);
    expect(item.oauthProviders[0].platform).toBe('github');
    expect(item.oauthProviders[0].nickname).toBe('OAuth User');
    expect(item.oauthProviders[0].avatarUrl).toBe('https://example.com/a.png');
  });

  it('管理员查看单个用户详情时也不含 OAuth 令牌', async () => {
    const res = await authed(app, admin.token)
      .get(`/api/v1/user/${oauthUserId}`)
      .expect(200);

    expectNoCredentials(res.body);
    expect(res.body.data.oauthProviders[0].platform).toBe('github');
  });

  it('本人可以查看自己的 profile，且响应不含密码与令牌', async () => {
    const res = await authed(app, alice.token)
      .get('/api/v1/user/profile')
      .expect(200);

    expect(res.body.data.email).toBe(ALICE_EMAIL);
    expect(res.body.data.username).toBe('e2ealice');
    expectNoCredentials(res.body);
  });

  it('本人可以按 id 查看自己，查看他人返回 403', async () => {
    await authed(app, alice.token)
      .get(`/api/v1/user/${alice.userId}`)
      .expect(200);

    await authed(app, alice.token)
      .get(`/api/v1/user/${bob.userId}`)
      .expect(403);
  });

  it('管理员可以按 id 查看任意用户', async () => {
    await authed(app, admin.token)
      .get(`/api/v1/user/${bob.userId}`)
      .expect(200);
  });

  it('注册接口的响应体也不含密码字段', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/user')
      .send({
        username: 'e2enewbie',
        email: 'newbie@e2e.test',
        password: 'e2e-Passw0rd!',
      })
      .expect(201);

    expect(res.body.data.password).toBeUndefined();
  });
});
