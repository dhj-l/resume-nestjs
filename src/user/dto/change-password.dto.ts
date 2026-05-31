import { IsString, MinLength, Matches, IsNotEmpty } from 'class-validator';

/**
 * 修改密码 DTO
 * 需提供旧密码与新密码,新密码最少 8 位且包含大小写字母、数字和特殊字符
 */
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty({ message: '请输入旧密码' })
  oldPassword: string;

  @IsString()
  @IsNotEmpty({ message: '请输入新密码' })
  @MinLength(6, { message: '新密码长度至少为6位' })
  newPassword: string;
}
