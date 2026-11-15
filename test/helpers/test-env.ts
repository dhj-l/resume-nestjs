/**
 * e2e 环境的单一事实来源（test/setup-e2e.ts 与 test/helpers/create-e2e-app.ts 共用）
 *
 * 关键安全阀：
 * - 强制指向独立测试库 ai-resume-e2e，绝不碰开发库；
 * - 强制覆盖 JWT_SECRET / AI 密钥，避免测试发出用生产密钥签名的 token、
 *   或误打真实 AI 上游；
 * - 每次建 App 前重置这些键，避免同一 worker 内 spec 之间互相污染。
 */

/** 测试库连接串（库名必须以 -e2e 结尾，assertTestDatabase 会强制校验） */
export const TEST_MONGODB_URI = 'mongodb://127.0.0.1:27017/ai-resume-e2e';

export const BASE_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  MONGODB_URI: TEST_MONGODB_URI,
  JWT_SECRET: 'e2e-test-jwt-secret-do-not-use-in-production',
  ENCRYPTION_KEY: 'e2e-test-encryption-key-at-least-32-chars',
  // 上游 AI / 语音服务：只给占位值，任何真实调用都应当失败
  DEEPSEEK_API_KEY: 'e2e-test-key',
  MIMO_API_KEY: 'e2e-test-key',
  // OAuth 三方的凭证在启动期是 getOrThrow，必须存在才能启动
  GITEE_CLIENT_ID: 'e2e',
  GITEE_CLIENT_SECRET: 'e2e',
  GITEE_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/gitee/callback',
  GITHUB_CLIENT_ID: 'e2e',
  GITHUB_CLIENT_SECRET: 'e2e',
  GITHUB_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/github/callback',
  QQ_CLIENT_ID: 'e2e',
  QQ_CLIENT_SECRET: 'e2e',
  QQ_REDIRECT_URI: 'http://localhost:3000/api/v1/auth/qq/callback',
  // 管理员白名单默认留空 = fail closed（需要管理员的用例自己覆盖）
  ADMIN_EMAILS: '',
  TRUST_PROXY: 'false',
  // 默认把限流放到极大，避免无关用例互相触发 429；限流用例自行调小
  THROTTLE_TTL_MS: '60000',
  THROTTLE_LIMIT: '100000',
};

/**
 * 重置 e2e 环境基线并叠加用例自定义覆盖项。
 * 必须在创建 Nest 测试模块之前调用（ConfigModule 只在模块初始化时读 env）。
 */
export function resetE2eEnv(overrides: Record<string, string> = {}): void {
  Object.assign(process.env, BASE_ENV, overrides);
}

/**
 * 校验连接串确实指向测试库。
 * 任何 dropDatabase 之前都必须过这一关，避免误删开发库/生产库。
 */
export function assertTestDatabase(uri: string): string {
  const matched = uri.match(/^mongodb:\/\/[^/]+\/([^?]+)/);
  const dbName = matched?.[1];
  if (!dbName || !dbName.endsWith('-e2e')) {
    throw new Error(
      `拒绝操作非测试数据库：${uri}（库名必须以 -e2e 结尾，见 test/helpers/test-env.ts）`,
    );
  }
  return dbName;
}
