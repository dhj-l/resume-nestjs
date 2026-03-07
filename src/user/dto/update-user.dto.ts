import {
  IsOptional,
  IsString,
  MinLength,
  MaxLength,
  IsEmail,
} from 'class-validator';

/**
 * 更新用户 DTO
 * 所有字段都是可选的,但如果提供则需要进行验证
 */
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(3, { message: '用户名长度至少为3位' })
  @MaxLength(20, { message: '用户名长度不能超过20位' })
  username?: string;

  @IsOptional()
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @MaxLength(100, { message: '邮箱长度不能超过100位' })
  email?: string;

  @IsOptional()
  @IsString()
  password?: string;
}
