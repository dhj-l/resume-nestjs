import { createHmac, randomBytes } from 'crypto';

/**
 * OAuth State 防 CSRF 工具
 *
 * 采用无状态 HMAC 签名方案，无需数据库存储：
 *   state = base64url(payload) + "." + base64url(HMAC-SHA256(payload))
 *   payload = nonce(16字节随机hex) + ":" + timestamp
 *
 * 验证时重新计算 HMAC 并比对签名，同时检查时效性。
 */

const STATE_TTL_MS = 5 * 60 * 1000; // state 有效期 5 分钟

/**
 * 生成带 HMAC 签名的 OAuth state 参数
 * @param secret 签名密钥（使用 JWT_SECRET 或应用密钥）
 * @returns base64url 编码的 state 字符串
 */
export function generateState(secret: string): string {
  const nonce = randomBytes(16).toString('hex');
  const timestamp = Date.now().toString();
  const payload = `${nonce}:${timestamp}`;

  const signature = createHmac('sha256', secret)
    .update(payload)
    .digest('base64url');

  // base64url 编码 payload，无需填充（base64url 天然 URL 安全）
  const encoded = Buffer.from(payload).toString('base64url');

  return `${encoded}.${signature}`;
}

/**
 * 验证 OAuth state 参数的签名和时效性
 * @param state 回调收到的 state 参数
 * @param secret 签名密钥（需与生成时一致）
 * @returns 有效返回 true，签名不匹配或超时返回 false
 */
export function verifyState(state: string, secret: string): boolean {
  try {
    // 格式：payload.signature
    const dotIndex = state.lastIndexOf('.');
    if (dotIndex === -1) return false;

    const encoded = state.substring(0, dotIndex);
    const signature = state.substring(dotIndex + 1);

    if (!encoded || !signature) return false;

    // 解码 payload
    const payload = Buffer.from(encoded, 'base64url').toString('utf8');

    // 重新计算签名
    const expectedSig = createHmac('sha256', secret)
      .update(payload)
      .digest('base64url');

    // 恒定时间比对（防时序攻击）
    if (!timingSafeEqual(signature, expectedSig)) return false;

    // 解析并检查时效性
    const parts = payload.split(':');
    if (parts.length !== 2) return false;

    const timestamp = parseInt(parts[1], 10);
    if (isNaN(timestamp)) return false;

    return Date.now() - timestamp <= STATE_TTL_MS;
  } catch {
    return false;
  }
}

/**
 * 恒定时间字符串比较，防止时序攻击
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
