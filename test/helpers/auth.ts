import { INestApplication } from '@nestjs/common';
import request from 'supertest';

export interface E2eUser {
  username: string;
  email: string;
  password: string;
  token: string;
  userId: string;
}

const DEFAULT_PASSWORD = 'e2e-Passw0rd!';

async function postJson(
  app: INestApplication,
  path: string,
  body: Record<string, unknown>,
): Promise<request.Response> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1${path}`)
    .send(body);

  if (res.status >= 300) {
    throw new Error(
      `POST ${path} 失败（${res.status}）：${JSON.stringify(res.body)}`,
    );
  }
  return res;
}

/** 注册一个用户（POST /user 默认 201） */
export async function registerUser(
  app: INestApplication,
  email: string,
  username = email.split('@')[0],
  password = DEFAULT_PASSWORD,
): Promise<{
  userId: string;
  email: string;
  password: string;
  username: string;
}> {
  const res = await postJson(app, '/user', { username, email, password });
  return {
    userId: String(res.body?.data?._id ?? ''),
    email,
    password,
    username,
  };
}

/** 用邮箱+密码登录，返回 token（POST /user/login 默认 201） */
export async function loginUser(
  app: INestApplication,
  email: string,
  password = DEFAULT_PASSWORD,
): Promise<string> {
  const res = await postJson(app, '/user/login', { email, password });
  const token = res.body?.data?.token;
  if (!token) {
    throw new Error(`登录未返回 token：${JSON.stringify(res.body)}`);
  }
  return token as string;
}

/** 注册并登录，返回带 token 的用户 */
export async function registerAndLogin(
  app: INestApplication,
  email: string,
  username = email.split('@')[0],
  password = DEFAULT_PASSWORD,
): Promise<E2eUser> {
  const user = await registerUser(app, email, username, password);
  const token = await loginUser(app, email, password);
  return { ...user, token };
}

/** 便捷方法：带 Bearer token 发起请求（返回带 .get/.post/.patch/.delete 的包装） */
export function authed(
  app: INestApplication,
  token: string,
): {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  delete: (url: string) => request.Test;
} {
  const agent = request(app.getHttpServer());
  const withAuth = (test: request.Test): request.Test =>
    test.set('Authorization', `Bearer ${token}`);

  return {
    get: (url: string) => withAuth(agent.get(url)),
    post: (url: string) => withAuth(agent.post(url)),
    patch: (url: string) => withAuth(agent.patch(url)),
    delete: (url: string) => withAuth(agent.delete(url)),
  };
}
