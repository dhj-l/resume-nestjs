import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { authed, E2eUser, registerAndLogin } from './helpers/auth';
import { closeE2eApp, createE2eApp } from './helpers/create-e2e-app';

/**
 * P0-2 回归：管理端接口必须只有 ADMIN_EMAILS 白名单内的账号可访问。
 *
 * 修复前 4 个 admin 控制器只挂 JwtAuthGuard，且由于 JwtStrategy 不回填 role、
 * User 表没有 role 字段，`req.user.role === 'admin'` 恒为 false —— 任何注册
 * 用户都能分页枚举全站简历、读取他人简历详情、物理删除他人简历。
 */
const ADMIN_EMAIL = 'admin@e2e.test';
const NORMAL_EMAIL = 'normal@e2e.test';

describe('管理端接口鉴权 (e2e)', () => {
  let app: INestApplication;
  let admin: E2eUser;
  let normal: E2eUser;

  const adminEndpoints = (): Array<{
    label: string;
    call: (token: string) => request.Test;
  }> => [
    {
      label: 'GET /admin/dashboard',
      call: (t) => authed(app, t).get('/api/v1/admin/dashboard'),
    },
    {
      label: 'GET /admin/resumes',
      call: (t) => authed(app, t).get('/api/v1/admin/resumes'),
    },
    {
      label: 'GET /admin/resumes/stats',
      call: (t) => authed(app, t).get('/api/v1/admin/resumes/stats'),
    },
    {
      label: 'GET /admin/ai-usage-records',
      call: (t) => authed(app, t).get('/api/v1/admin/ai-usage-records'),
    },
    {
      label: 'GET /admin/ai-usage-records/stats',
      call: (t) => authed(app, t).get('/api/v1/admin/ai-usage-records/stats'),
    },
    {
      label: 'GET /admin/users/stats',
      call: (t) => authed(app, t).get('/api/v1/admin/users/stats'),
    },
  ];

  beforeAll(async () => {
    app = await createE2eApp({ ADMIN_EMAILS: ADMIN_EMAIL });
    admin = await registerAndLogin(app, ADMIN_EMAIL, 'e2eadmin');
    normal = await registerAndLogin(app, NORMAL_EMAIL, 'e2enormal');
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('未携带 token 访问管理端返回 401', async () => {
    await request(app.getHttpServer())
      .get('/api/v1/admin/dashboard')
      .expect(401);
  });

  it('普通用户访问全部管理端接口都返回 403', async () => {
    for (const endpoint of adminEndpoints()) {
      const res = await endpoint.call(normal.token);
      expect(`${endpoint.label} -> ${res.status}`).toBe(
        `${endpoint.label} -> 403`,
      );
    }
  });

  it('普通用户删除任意简历返回 403（不会真的删掉）', async () => {
    await authed(app, normal.token)
      .delete('/api/v1/admin/resumes/507f1f77bcf86cd799439011')
      .expect(403);
  });

  it('管理员访问全部管理端接口都不被鉴权拦截', async () => {
    for (const endpoint of adminEndpoints()) {
      const res = await endpoint.call(admin.token);
      expect(`${endpoint.label} -> ${res.status}`).toBe(
        `${endpoint.label} -> 200`,
      );
    }
  });

  it('管理员能真正进入 handler：删除不存在的简历返回 404 而非 403', async () => {
    const res = await authed(app, admin.token).delete(
      '/api/v1/admin/resumes/507f1f77bcf86cd799439011',
    );

    expect(res.status).toBe(404);
  });
});
