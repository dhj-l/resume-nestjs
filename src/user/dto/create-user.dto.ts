import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  @IsNotEmpty({ message: '用户名不能为空' })
  @MinLength(3, { message: '用户名长度至少为3位' })
  @MaxLength(20, { message: '用户名长度不能超过20位' })
  username: string;

  @IsString()
  @IsNotEmpty({ message: '密码不能为空' })
  @MinLength(8, { message: '密码长度至少为8位' })
  @MaxLength(128, { message: '密码长度不能超过128位' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message:
      '密码必须包含至少一个大写字母、一个小写字母、一个数字和一个特殊字符',
  })
  password: string;

  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @IsNotEmpty({ message: '邮箱不能为空' })
  @MaxLength(100, { message: '邮箱长度不能超过100位' })
  email: string;
}
