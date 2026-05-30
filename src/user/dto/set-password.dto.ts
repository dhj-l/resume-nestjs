import { IsString, IsNotEmpty, MinLength } from 'class-validator';

/**
 * OAuth 用户设置密码 DTO
 * 仅需提供新密码，无需旧密码（因为 OAuth 用户此前没有密码）
 */
export class SetPasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入新密码' })
  @MinLength(8, { message: '新密码长度至少为8位' })
  newPassword: string;
}
