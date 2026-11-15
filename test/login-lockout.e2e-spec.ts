import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { registerUser } from './helpers/auth';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * P0-5 回归：登录不能成为「锁死他人账号」的工具。
 *
 * 修复前 src/user/user.service.ts:90 在比对密码之前就读 user.lockedUntil，
 * 且失败计数是账号维度，任何人只要知道邮箱、连发 5 次错误密码，就能把该用户
 * 锁 30 分钟（自己的正确密码也进不去）。
 *
 * 修复后的语义：
 * - 锁的粒度是 (邮箱, 来源 IP)：攻击者只能锁住自己那个来源；
 * - 受害者从别的 IP 用正确密码照常登录 —— 这是本文件最重要的一条断言；
 * - 来源不可信（回环，说明没配好代理）时永不硬锁，避免「一人锁死全体」。
 */
const EMAIL = 'victim@e2e.test';
const PASSWORD = 'e2e-Passw0rd!';
const ATTACKER_IP = '203.0.113.7';
const VICTIM_IP = '198.51.100.9';
const FRESH_IP = '192.0.2.55';

function login(
  app: INestApplication,
  password: string,
  ip?: string,
): request.Test {
  const req = request(app.getHttpServer())
    .post('/api/v1/user/login')
    .send({ email: EMAIL, password });
  return ip ? req.set('X-Forwarded-For', ip) : req;
}

describe('登录锁定不影响正常用户 (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createE2eApp({ TRUST_PROXY: '1' });
    await registerUser(app, EMAIL, 'e2evictim', PASSWORD);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('攻击者从自己的 IP 连续输错后会锁住「该来源」，而不是该账号', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await login(app, 'definitely-wrong', ATTACKER_IP);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('邮箱或密码错误');
    }

    const blocked = await login(app, 'definitely-wrong', ATTACKER_IP);
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toMatch(/分钟/);
  });

  it('受害者从另一个 IP 用正确密码仍然登录成功（核心断言）', async () => {
    const res = await login(app, PASSWORD, VICTIM_IP);

    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
  });

  it('账号本身没有被锁：换一个干净 IP 也能登录', async () => {
    const res = await login(app, PASSWORD, FRESH_IP);

    expect(res.status).toBe(201);
  });

  it('来源不可信（未配代理的回环地址）时永不硬锁，正确密码始终可登录', async () => {
    for (let i = 0; i < 6; i += 1) {
      await login(app, 'definitely-wrong');
    }

    const res = await login(app, PASSWORD);
    expect(res.status).toBe(201);
  });

  it('不存在的邮箱与存在的邮箱返回同样的失败文案', async () => {
    const missing = await request(app.getHttpServer())
      .post('/api/v1/user/login')
      .set('X-Forwarded-For', '203.0.113.99')
      .send({ email: 'nobody@e2e.test', password: 'whatever' });

    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('邮箱或密码错误');
  });
});
