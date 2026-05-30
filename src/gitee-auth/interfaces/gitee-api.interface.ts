/**
 * Gitee OAuth API 响应类型定义
 *
 * 参考文档：https://gitee.com/api/v5/oauth_doc
 */

/**
 * POST https://gitee.com/oauth/token 响应
 * 使用授权码换取访问令牌
 */
export interface GiteeTokenResponse {
  /** 访问令牌 */
  access_token: string;
  /** 令牌类型，固定为 "bearer" */
  token_type: string;
  /** 令牌有效期（秒），默认 86400（24小时） */
  expires_in: number;
  /** 刷新令牌，用于续期 access_token */
  refresh_token: string;
  /** 授权的权限范围 */
  scope: string;
  /** 令牌创建时间（Unix 时间戳） */
  created_at: number;
}

/**
 * GET https://gitee.com/api/v5/user 响应（已授权用户信息）
 */
export interface GiteeUserResponse {
  /** Gitee 用户数字 ID */
  id: number;
  /** Gitee 登录名（用户名） */
  login: string;
  /** 显示名称 */
  name: string;
  /** 头像 URL */
  avatar_url: string;
  /** API 资源 URL */
  url: string;
  /** 个人主页 URL */
  html_url: string;
  /** 邮箱（可能为 null，取决于 scope 和用户隐私设置） */
  email: string | null;
  /** 公司 */
  company: string | null;
  /** 博客/网站 */
  blog: string | null;
  /** 所在地 */
  location: string | null;
  /** 个人简介 */
  bio: string | null;
  /** 粉丝数 */
  followers: number;
  /** 关注数 */
  following: number;
}

/**
 * Gitee OAuth 模块配置（从 ConfigService 读取）
 */
export interface GiteeOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  /** 前端 OAuth 回调页地址，后端处理完 OAuth 后 302 重定向到此页面 */
  frontendCallbackUrl: string;
}
