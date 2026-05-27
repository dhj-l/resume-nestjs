import { Module } from '@nestjs/common';
import { GiteeAuthController } from './gitee-auth.controller';
import { GiteeAuthService } from './gitee-auth.service';
import { UserModule } from '../user/user.module';

/**
 * Gitee OAuth 认证模块
 *
 * 依赖：
 *   - UserModule: 用户创建/绑定
 *   - JwtModule: JWT 签发（通过 AppModule 全局注册，此处无需重复导入）
 */
@Module({
  imports: [UserModule],
  controllers: [GiteeAuthController],
  providers: [GiteeAuthService],
  exports: [GiteeAuthService],
})
export class GiteeAuthModule {}
