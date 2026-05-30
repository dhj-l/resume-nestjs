/**
 * OAuth 用户对象脱敏工具
 *
 * 从 Mongoose 文档中移除敏感字段（accessToken / refreshToken / password），
 * 用于 OAuth 回调时返回给前端的用户信息。
 */

/**
 * 脱敏 OAuth 用户对象
 *
 * 1. 将 Mongoose Document 转为 plain object（如适用）
 * 2. 清理 oauthProviders 中的 accessToken / refreshToken / tokenExpiresAt
 * 3. 移除 password 字段
 *
 * @param user Mongoose Document 或 plain object
 * @returns 脱敏后的用户对象
 */
export function sanitizeOAuthUser(
  user: Record<string, unknown>,
): Record<string, unknown> {
  // Mongoose Document 需要调用 toObject() 转为 plain object
  const userObject =
    typeof (user as any).toObject === 'function'
      ? (user as any).toObject()
      : { ...user };

  // 清理 OAuth 提供商中的敏感字段
  if (userObject.oauthProviders) {
    userObject.oauthProviders = userObject.oauthProviders.map(
      (p: Record<string, unknown>) => ({
        platform: p.platform,
        platformUserId: p.platformUserId,
        nickname: p.nickname,
        avatarUrl: p.avatarUrl,
        profileUrl: p.profileUrl,
      }),
    );
  }

  // 移除密码字段
  Reflect.deleteProperty(userObject, 'password');

  return userObject;
}
