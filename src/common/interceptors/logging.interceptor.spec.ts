import { of, throwError } from 'rxjs';
import { ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { LoggingInterceptor } from './logging.interceptor';

/* ------------------------------------------------------------------ */
/*  辅助：构造 Express 风格的 mock context                            */
/* ------------------------------------------------------------------ */

interface MockRequest {
  method: string;
  originalUrl: string;
  url: string;
  ip: string;
  headers: Record<string, string | undefined>;
  body: unknown;
  connection?: { remoteAddress?: string };
  user?: { userId: string; username: string; email: string };
}

interface MockResponse {
  statusCode: number;
}

function buildContext(
  reqOverrides: Partial<MockRequest> = {},
  statusCode = 200,
): ExecutionContext {
  const req: MockRequest = {
    method: 'GET',
    originalUrl: '/api/v1/resume/123',
    url: '/api/v1/resume/123',
    ip: '192.168.1.1',
    headers: { 'user-agent': 'Jest/29.0', 'x-forwarded-for': undefined },
    body: {},
    ...reqOverrides,
  };

  const res: MockResponse = { statusCode };

  return {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as ExecutionContext;
}

function callHandler(data: unknown = {}): CallHandler {
  return { handle: () => of(data) };
}

function callHandlerError(error: Error & { status?: number }): CallHandler {
  return { handle: () => throwError(() => error) };
}

/* ------------------------------------------------------------------ */
/*  测试套件                                                          */
/* ------------------------------------------------------------------ */

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  /* ================================================================ */
  /*  请求日志                                                         */
  /* ================================================================ */
  describe('请求日志（→）', () => {
    it('应记录 method、path、ip、user-agent', (done) => {
      const ctx = buildContext();
      const next = callHandler({ ok: true });

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toBeDefined();
          expect(reqLog).toContain('GET');
          expect(reqLog).toContain('/api/v1/resume/123');
          expect(reqLog).toContain('ip=192.168.1.1');
          expect(reqLog).toContain('Jest/29.0');
          done();
        },
      });
    });

    it('X-Forwarded-For 应优先于 request.ip', (done) => {
      const ctx = buildContext({
        headers: {
          'x-forwarded-for': '10.0.0.5, 192.168.1.1',
          'user-agent': 'curl/8.0',
        },
      });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('ip=10.0.0.5');
          done();
        },
      });
    });

    it('已认证请求应记录 userId', (done) => {
      const ctx = buildContext({
        user: {
          userId: 'user-abc-123',
          username: 'admin',
          email: 'admin@test.com',
        },
      });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('uid=user-abc-123');
          done();
        },
      });
    });

    it('无 user-agent 时应显示 "-"', (done) => {
      const ctx = buildContext({ headers: {} });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('ua="-"');
          done();
        },
      });
    });
  });

  /* ================================================================ */
  /*  响应日志                                                         */
  /* ================================================================ */
  describe('响应日志（←）', () => {
    it('成功响应应记录状态码和耗时', (done) => {
      const ctx = buildContext({}, 201);
      const next = callHandler({ id: 1 });

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const resLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].includes('201'),
          )?.[0];
          expect(resLog).toBeDefined();
          expect(resLog).toMatch(/\d+ms$/);
          done();
        },
      });
    });

    it('4xx 响应应使用 warn 级别', (done) => {
      const ctx = buildContext({}, 400);
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const warnLog = warnSpy.mock.calls.find((c: string[]) =>
            c[0].includes('400'),
          )?.[0];
          expect(warnLog).toBeDefined();
          done();
        },
      });
    });

    it('5xx 响应应使用 warn 级别', (done) => {
      const ctx = buildContext({}, 500);
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const warnLog = warnSpy.mock.calls.find((c: string[]) =>
            c[0].includes('500'),
          )?.[0];
          expect(warnLog).toBeDefined();
          done();
        },
      });
    });

    it('异常响应应使用 error 级别并包含错误消息', (done) => {
      const ctx = buildContext({});
      const error: Error & { status?: number } = new Error('Something broke');
      error.status = 503;
      const next = callHandlerError(error);

      interceptor.intercept(ctx, next).subscribe({
        error: () => {
          const errLog = errorSpy.mock.calls.find((c: string[]) =>
            c[0].includes('503'),
          )?.[0];
          expect(errLog).toBeDefined();
          expect(errLog).toContain('Something broke');
          done();
        },
      });
    });
  });

  /* ================================================================ */
  /*  请求体脱敏                                                        */
  /* ================================================================ */
  describe('请求体脱敏', () => {
    it('password/token/secret 字段应替换为 ***', (done) => {
      const ctx = buildContext({
        method: 'POST',
        body: {
          username: 'admin',
          password: 'super-secret-123',
          email: 'admin@test.com',
          accessToken: 'eyJhbGciOiJIUzI1NiIs...',
        },
      });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('"password":"***"');
          expect(reqLog).toContain('"accessToken":"***"');
          expect(reqLog).toContain('"username":"admin"');
          expect(reqLog).toContain('"email":"admin@test.com"');
          done();
        },
      });
    });

    it('refresh_token / oldPassword 字段应脱敏', (done) => {
      const ctx = buildContext({
        method: 'POST',
        body: {
          oldPassword: 'old-secret',
          newPassword: 'new-secret',
          refresh_token: 'refresh-abc',
        },
      });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('"oldPassword":"***"');
          expect(reqLog).toContain('"newPassword":"***"');
          expect(reqLog).toContain('"refresh_token":"***"');
          done();
        },
      });
    });

    it('嵌套对象中的敏感字段应递归脱敏', (done) => {
      const ctx = buildContext({
        method: 'POST',
        body: {
          user: { password: 'nested-secret', name: 'test' },
          config: { apiKey: 'abc', secret: 'xyz' },
        },
      });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('"password":"***"');
          expect(reqLog).toContain('"secret":"***"');
          expect(reqLog).toContain('"name":"test"');
          done();
        },
      });
    });

    it('数组中的敏感字段应脱敏', (done) => {
      const ctx = buildContext({
        method: 'POST',
        body: {
          items: [
            { name: 'a', password: 'p1' },
            { name: 'b', password: 'p2' },
          ],
        },
      });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('"password":"***"');
          expect(reqLog).toContain('"name":"a"');
          done();
        },
      });
    });
  });

  /* ================================================================ */
  /*  边界场景                                                         */
  /* ================================================================ */
  describe('边界场景', () => {
    it('GET 请求无 body 时不输出 body 段', (done) => {
      const ctx = buildContext({ method: 'GET', body: {} });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).not.toContain('body=');
          done();
        },
      });
    });

    it('null body 不输出 body 段', (done) => {
      const ctx = buildContext({ method: 'POST', body: null });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).not.toContain('body=');
          done();
        },
      });
    });

    it('user-agent 超 120 字符应截断', (done) => {
      const longUA = 'Mozilla/5.0 ' + 'x'.repeat(200);
      const ctx = buildContext({ headers: { 'user-agent': longUA } });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          const uaMatch = reqLog!.match(/ua="(.+?)"/);
          expect(uaMatch).not.toBeNull();
          expect(uaMatch![1].length).toBeLessThanOrEqual(120);
          done();
        },
      });
    });

    it('超长 body 应截断', (done) => {
      const longBody = {
        description: 'x'.repeat(2500),
        name: 'test',
      };
      const ctx = buildContext({ method: 'POST', body: longBody });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).toContain('body=');
          expect(reqLog).toContain('…');
          done();
        },
      });
    });

    it('POST 空 body 不输出 body 段', (done) => {
      const ctx = buildContext({ method: 'POST', body: {} });
      const next = callHandler({});

      interceptor.intercept(ctx, next).subscribe({
        next: () => {
          const reqLog = logSpy.mock.calls.find((c: string[]) =>
            c[0].startsWith('→ '),
          )?.[0];
          expect(reqLog).not.toContain('body=');
          done();
        },
      });
    });
  });
});
