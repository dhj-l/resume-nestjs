import { IsNotEmpty, IsString } from 'class-validator';

/**
 * OAuth 回调请求参数校验 DTO（Gitee / GitHub 通用）
 *
 * OAuth 授权成功后重定向到 redirect_uri 时携带以下 query 参数：
 *   ?code=授权码&state=防CSRF参数
 */
export class OAuthCallbackDto {
  /**
   * 授权码（authorization code）
   * 用于换取 access_token，一次性使用，有效期极短
   */
  @IsString()
  @IsNotEmpty({ message: '授权码(code)不能为空' })
  code: string;

  /**
   * 防 CSRF 状态参数
   * 由发起授权时生成，回调时原样返回，用于验证请求合法性
   */
  @IsString()
  @IsNotEmpty({ message: 'state参数不能为空' })
  state: string;
}
