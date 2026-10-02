import { INestApplication } from '@nestjs/common';
import { existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { authed, E2eUser, registerAndLogin } from './helpers/auth';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * P0-6 回归：上传不能把可执行内容落到公开静态目录。
 *
 * 修复前 fileFilter 只比对客户端声明的 mimetype，落盘文件名取自
 * originalname，于是 `evil.html` + `Content-Type: image/png` 会被原样写成
 * uploads/evil.html，并通过 /uploads/evil.html 在同源下执行脚本。
 */
const UPLOAD_DIR = join(process.cwd(), 'uploads');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==',
  'base64',
);
const HTML_PAYLOAD = Buffer.from('<!DOCTYPE html><script>alert(1)</script>');

function listUploads(): string[] {
  return existsSync(UPLOAD_DIR) ? readdirSync(UPLOAD_DIR) : [];
}

describe('上传安全 (e2e)', () => {
  let app: INestApplication;
  let user: E2eUser;
  /** 进入本用例前 uploads/ 里已有哪些文件（用于结束时精确清理本次新增的） */
  let uploadsBefore: string[] = [];

  beforeAll(async () => {
    uploadsBefore = listUploads();
    app = await createE2eApp();
    user = await registerAndLogin(app, 'uploader@e2e.test', 'e2euploader');
  });

  afterAll(async () => {
    // 按「目录快照差集」清理，这样即使某个断言中途失败也不会把测试文件留在 uploads/
    const created = listUploads().filter(
      (name) => !uploadsBefore.includes(name),
    );
    for (const name of created) {
      try {
        unlinkSync(join(UPLOAD_DIR, name));
      } catch {
        // 已被删除或从未落盘
      }
    }
    await closeE2eApp(app);
  });

  it('正常图片上传成功，且落盘扩展名由 MIME 推导', async () => {
    const res = await authed(app, user.token)
      .post('/api/v1/upload/image')
      .attach('file', PNG, {
        filename: 'totally-a-resume.html', // 故意用危险扩展名
        contentType: 'image/png',
      });

    expect(res.status).toBe(201);
    const url: string = res.body.data.url;
    expect(url.startsWith('/uploads/')).toBe(true);
    expect(url.endsWith('.png')).toBe(true);
    // 绝不能沿用 originalname 的扩展名
    expect(url.endsWith('.html')).toBe(false);
  });

  it('把 HTML 内容伪报成 image/png 时被拒绝，且磁盘不留残留', async () => {
    const before = listUploads();

    const res = await authed(app, user.token)
      .post('/api/v1/upload/image')
      .attach('file', HTML_PAYLOAD, {
        filename: 'evil.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(400);
    expect(listUploads()).toEqual(before);
  });

  it('扩展名与声明类型都在黑名单时被拒绝（text/html）', async () => {
    const before = listUploads();

    const res = await authed(app, user.token)
      .post('/api/v1/upload/image')
      .attach('file', HTML_PAYLOAD, {
        filename: 'evil.html',
        contentType: 'text/html',
      });

    expect(res.status).toBe(400);
    expect(listUploads()).toEqual(before);
  });

  it('SVG 这类可携带脚本的图片类型被拒绝', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>');

    const res = await authed(app, user.token)
      .post('/api/v1/upload/image')
      .attach('file', svg, {
        filename: 'evil.svg',
        contentType: 'image/svg+xml',
      });

    expect(res.status).toBe(400);
  });

  it('未登录上传被拒绝', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/upload/image')
      .attach('file', PNG, { filename: 'a.png', contentType: 'image/png' })
      .expect(401);
  });
});
