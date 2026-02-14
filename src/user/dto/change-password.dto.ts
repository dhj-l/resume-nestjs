import { IsString, MinLength } from 'class-validator';

/**
 * 修改密码 DTO
 * 需提供旧密码与新密码，新密码最少 6 位
 */
export class ChangePasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
