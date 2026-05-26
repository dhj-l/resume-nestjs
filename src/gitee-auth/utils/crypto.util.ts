import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'crypto';

/**
 * AES-256-GCM 加密工具
 * 用于加密存储 OAuth access_token，防止数据库泄露时令牌被直接利用
 *
 * 密钥派生：使用 scrypt 将 ENCRYPTION_KEY 环境变量派生为 32 字节的 AES-256 密钥
 * 加密格式：iv(16字节hex) : authTag(16字节hex) : ciphertext(hex)
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // AES-GCM 推荐 12 字节，这里使用 16 字节以增强安全性
const KEY_LENGTH = 32; // AES-256 需要 32 字节密钥
const SALT = 'gitee-oauth-nestjs-resume';

/**
 * 从环境变量密钥派生 AES 密钥
 */
export function deriveEncryptionKey(secret: string): Buffer {
  return scryptSync(secret, SALT, KEY_LENGTH);
}

/**
 * 加密明文令牌
 * @param plaintext 原始 access_token
 * @param key 派生的 AES-256 密钥
 * @returns 格式为 iv:authTag:ciphertext 的 hex 字符串
 */
export function encryptToken(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * 解密密文令牌
 * @param ciphertext 格式为 iv:authTag:ciphertext 的 hex 字符串
 * @param key 派生的 AES-256 密钥
 * @returns 原始 access_token
 * @throws 密钥不匹配或数据被篡改时抛出解密失败错误
 */
export function decryptToken(ciphertext: string, key: Buffer): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('无效的密文格式');
  }

  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
    'utf8',
  );
}
