import { IsEmail, IsNotEmpty } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: '请输入正确的邮箱格式' })
  @IsNotEmpty({ message: '请输入邮箱' })
  email: string;
  @IsNotEmpty({ message: '请输入密码' })
  password: string;
}
