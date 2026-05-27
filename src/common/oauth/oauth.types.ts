/**
 * OAuth 模块共享类型定义
 *
 * 各 OAuth 提供商（Gitee / GitHub / QQ）通用的配置和结果类型。
 */

/**
 * OAuth 提供商配置（从 ConfigService 读取）
 *
 * 所有 OAuth 平台的配置结构相同，仅环境变量前缀不同。
 */
export interface OAuthConfig {
  /** 应用 ID */
  clientId: string;
  /** 应用密钥 */
  clientSecret: string;
  /** 回调地址 */
  redirectUri: string;
  /** 权限范围 */
  scope: string;
  /** 前端 OAuth 回调页地址 */
  frontendCallbackUrl: string;
}

/**
 * OAuth 回调处理结果
 */
export interface OAuthCallbackResult {
  /** JWT 令牌 */
  token: string;
  /** 用户信息（已脱敏，不含敏感字段） */
  user: Record<string, unknown>;
}

/**
 * OAuth token 交换响应的通用形状
 *
 * 各平台的 token 响应可能包含更多字段，但至少需要 access_token。
 * expires_in 和 refresh_token 为可选（GitHub 默认无过期/刷新令牌）。
 */
export interface OAuthTokenData {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
}

/**
 * findOrCreateOAuthUser 方法参数类型
 *
 * 与 UserService.findOrCreateOAuthUser 的参数签名一致。
 */
export interface FindOrCreateOAuthUserParams {
  platform: string;
  platformUserId: string;
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  nickname?: string;
  avatarUrl?: string;
  profileUrl?: string;
  email?: string;
  verifiedEmail?: string;
}
