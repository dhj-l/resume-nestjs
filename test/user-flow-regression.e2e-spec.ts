import { INestApplication } from '@nestjs/common';
import { unlinkSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { authed, E2eUser, loginUser, registerAndLogin } from './helpers/auth';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * 正常用户完整流程回归
 *
 * 这一条用例存在的唯一目的：证明为了修 P0 加上的鉴权、限流、脱敏、登录保护与
 * 上传校验，没有挡住任何正常用户的操作。流程覆盖注册、登录、简历 CRUD + 复制、
 * 个人资料、改密后用新密码登录、上传图片、公开模板列表。
 */
const EMAIL = 'journey@e2e.test';
const PASSWORD = 'e2e-Passw0rd!';
const NEW_PASSWORD = 'e2e-NewPassw0rd!';
const UPLOAD_DIR = join(process.cwd(), 'uploads');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);

describe('正常用户完整流程回归 (e2e)', () => {
  let app: INestApplication;
  let user: E2eUser;
  let resumeId = '';
  let uploadsBefore: string[] = [];

  beforeAll(async () => {
    uploadsBefore = existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : [];
    app = await createE2eApp();
    user = await registerAndLogin(app, EMAIL, 'e2ejourney', PASSWORD);
  });

  afterAll(async () => {
    const uploaded = (
      existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : []
    ).filter((name) => !uploadsBefore.includes(name));
    for (const name of uploaded) {
      try {
        unlinkSync(join(UPLOAD_DIR, name));
      } catch {
        // 忽略
      }
    }
    await closeE2eApp(app);
  });

  it('注册后可以登录，并拿到 token 与脱敏后的用户信息', async () => {
    expect(user.token).toBeTruthy();
    expect(user.userId).toBeTruthy();

    const res = await request(app.getHttpServer())
      .post('/api/v1/user/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(201);

    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.email).toBe(EMAIL);
    expect(res.body.data.user.password).toBeUndefined();
    // 统一响应包络不能被绕过
    expect(res.body.code).toBe(200);
    expect(res.body.path).toBe('/api/v1/user/login');
  });

  it('可以创建简历并读取分页列表', async () => {
    const created = await authed(app, user.token)
      .post('/api/v1/resume')
      .send({ title: 'e2e 简历' })
      .expect(201);

    resumeId = String(created.body.data._id);
    expect(resumeId).toBeTruthy();

    const list = await authed(app, user.token)
      .get('/api/v1/resume?page=1&pageSize=10')
      .expect(200);

    const ids = list.body.data.list.map((item: any) => String(item._id));
    expect(ids).toContain(resumeId);
  });

  it('可以读取详情、更新、复制与删除自己的简历', async () => {
    const detail = await authed(app, user.token)
      .get(`/api/v1/resume/${resumeId}`)
      .expect(200);
    expect(String(detail.body.data._id)).toBe(resumeId);

    const updated = await authed(app, user.token)
      .patch(`/api/v1/resume/${resumeId}`)
      .send({ title: 'e2e 简历（已更新）' })
      .expect(200);
    expect(updated.body.data.title).toBe('e2e 简历（已更新）');

    const copied = await authed(app, user.token)
      .post(`/api/v1/resume/${resumeId}/copy`)
      .send({})
      .expect(201);
    const copiedId = String(copied.body.data._id);
    expect(copiedId).not.toBe(resumeId);

    await authed(app, user.token)
      .delete(`/api/v1/resume/${copiedId}`)
      .expect(200);
    await authed(app, user.token)
      .delete(`/api/v1/resume/${resumeId}`)
      .expect(200);
  });

  it('可以读取与更新自己的个人资料', async () => {
    const profile = await authed(app, user.token)
      .get('/api/v1/user/profile')
      .expect(200);
    expect(profile.body.data.email).toBe(EMAIL);
    expect(profile.body.data.password).toBeUndefined();

    const updated = await authed(app, user.token)
      .patch('/api/v1/user/profile')
      .send({ username: 'e2ejourney2' })
      .expect(200);
    expect(updated.body.data.username).toBe('e2ejourney2');
  });

  it('可以上传合法图片并拿到可访问的 URL', async () => {
    const res = await authed(app, user.token)
      .post('/api/v1/upload/image')
      .attach('file', PNG, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201);

    expect(res.body.data.url).toMatch(/^\/uploads\/.+\.png$/);
  });

  it('未登录也能读取公开模板列表', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/template')
      .expect(200);

    expect(Array.isArray(res.body.data.list)).toBe(true);
  });

  it('改密后可以用新密码登录，且旧密码失效', async () => {
    await authed(app, user.token)
      .patch('/api/v1/user/change-password')
      .send({ oldPassword: PASSWORD, newPassword: NEW_PASSWORD })
      .expect(200);

    const newToken = await loginUser(app, EMAIL, NEW_PASSWORD);
    expect(newToken).toBeTruthy();

    await request(app.getHttpServer())
      .post('/api/v1/user/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(400);
  });
});
