import { Module } from '@nestjs/common';
import { QQAuthController } from './qq-auth.controller';
import { QQAuthService } from './qq-auth.service';
import { UserModule } from '../user/user.module';

/**
 * QQ OAuth 认证模块
 *
 * 提供 QQ 互联 OAuth 2.0 登录功能
 *
 * 依赖：
 *   - UserModule: 用户创建/绑定/查询
 *   - CryptoModule (全局): 令牌加密
 *   - JwtModule (全局): JWT 签发
 */
@Module({
  imports: [UserModule],
  controllers: [QQAuthController],
  providers: [QQAuthService],
  exports: [QQAuthService],
})
export class QQAuthModule {}
