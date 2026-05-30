import { Module } from '@nestjs/common';
import { GitHubAuthController } from './github-auth.controller';
import { GitHubAuthService } from './github-auth.service';
import { UserModule } from '../user/user.module';

/**
 * GitHub OAuth 认证模块
 *
 * 依赖：
 *   - UserModule: 用户创建/绑定
 *   - JwtModule: JWT 签发（通过 AppModule 全局注册，此处无需重复导入）
 */
@Module({
  imports: [UserModule],
  controllers: [GitHubAuthController],
  providers: [GitHubAuthService],
  exports: [GitHubAuthService],
})
export class GitHubAuthModule {}
