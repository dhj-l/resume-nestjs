/**
 * GitHub OAuth API 响应类型定义
 *
 * 参考文档：https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */

/**
 * POST https://github.com/login/oauth/access_token 响应
 * 使用授权码换取访问令牌
 *
 * 注意：GitHub 的 token 响应没有 expires_in 和 refresh_token
 * GitHub OAuth token 默认不过期（除非用户撤销或应用配置了过期策略）
 */
export interface GitHubTokenResponse {
  /** 访问令牌 */
  access_token: string;
  /** 令牌类型，固定为 "bearer" */
  token_type: string;
  /** 授权的权限范围 */
  scope: string;
}

/**
 * GET https://api.github.com/user 响应（已授权用户信息）
 */
export interface GitHubUserResponse {
  /** GitHub 用户数字 ID */
  id: number;
  /** GitHub 登录名（用户名） */
  login: string;
  /** 显示名称 */
  name: string | null;
  /** 头像 URL */
  avatar_url: string;
  /** API 资源 URL */
  url: string;
  /** 个人主页 URL */
  html_url: string;
  /** 邮箱（可能为 null，取决于用户隐私设置） */
  email: string | null;
  /** 公司 */
  company: string | null;
  /** 博客/网站 */
  blog: string | null;
  /** 所在地 */
  location: string | null;
  /** 个人简介 */
  bio: string | null;
  /** 公开仓库数 */
  public_repos: number;
  /** 粉丝数 */
  followers: number;
  /** 关注数 */
  following: number;
}

/**
 * GET https://api.github.com/user/emails 响应元素
 * 用于获取用户已验证的邮箱地址
 */
export interface GitHubEmailEntry {
  /** 邮箱地址 */
  email: string;
  /** 是否为主邮箱 */
  primary: boolean;
  /** 是否已通过平台验证 */
  verified: boolean;
  /** 邮箱可见性 */
  visibility: string | null;
}

/**
 * GitHub OAuth 模块配置（从 ConfigService 读取）
 */
export interface GitHubOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string;
  /** 前端 OAuth 回调页地址，后端处理完 OAuth 后 302 重定向到此页面 */
  frontendCallbackUrl: string;
}
