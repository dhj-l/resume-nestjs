/**
 * QQ OAuth API 响应类型定义
 *
 * 参考文档：https://wiki.connect.qq.com/
 */

/**
 * GET https://graph.qq.com/oauth2.0/me 响应（获取 OpenID）
 *
 * 需要 fmt=json 参数才能返回 JSON 格式，默认返回 callback 包裹的 JSONP
 */
export interface QQOpenIDResponse {
  /** 应用唯一标识 */
  client_id: string;
  /** 用户唯一标识（与应用关联，同一用户在不同应用下 openid 不同） */
  openid: string;
  /** 联合唯一标识（可选，需应用接入 unionid 体系） */
  unionid?: string;
}

/**
 * POST https://graph.qq.com/oauth2.0/token 响应
 *
 * 默认返回 URL 编码格式，添加 fmt=json 后返回 JSON
 */
export interface QQTokenResponse {
  /** 访问令牌 */
  access_token: string;
  /** 令牌有效期（秒），QQ 默认较长（如 7776000 = 90 天） */
  expires_in: number;
  /** 刷新令牌 */
  refresh_token: string;
}

/**
 * GET https://graph.qq.com/user/get_user_info 响应（已授权用户信息）
 *
 * 需要 access_token、oauth_consumer_key（即 appid/client_id）、openid 三个参数
 */
export interface QQUserResponse {
  /** 返回码，0 表示成功 */
  ret: number;
  /** 错误提示信息 */
  msg: string;
  /** 是否为 QQ 会员：'1' 是 / '0' 否 */
  is_yellow_vip: string;
  /** 是否为年费 QQ 会员 */
  is_yellow_year_vip: string;
  /** QQ 会员等级 */
  yellow_vip_level: string;
  /** 黄钻等级 */
  level: string;
  /** 是否为黄钻 */
  is_yellow_high_vip: string;
  /** 昵称 */
  nickname: string;
  /** 头像 URL（100x100） */
  figureurl: string;
  /** 头像 URL（40x40） */
  figureurl_1: string;
  /** 头像 URL（50x50） */
  figureurl_2: string;
  /** 头像 URL（640x640 或 1000x1000） */
  figureurl_qq: string;
  /** 头像 URL（40x40） */
  figureurl_qq_1: string;
  /** 头像 URL（100x100） */
  figureurl_qq_2: string;
  /** 性别 */
  gender: string;
  /** 省份 */
  province: string;
  /** 城市 */
  city: string;
  /** 年份 */
  year: string;
}

/**
 * QQ OAuth 模块配置（从 ConfigService 读取）
 */
export interface QQOAuthConfig {
  /** 应用 ID（在 QQ 互联申请） */
  clientId: string;
  /** 应用密钥 */
  clientSecret: string;
  /** 回调地址（在 QQ 互联设置） */
  redirectUri: string;
  /** 权限范围 */
  scope: string;
  /** 前端 OAuth 回调页地址 */
  frontendCallbackUrl: string;
}
