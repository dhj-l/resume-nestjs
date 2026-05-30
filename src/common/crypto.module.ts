import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { deriveEncryptionKey } from './utils/crypto.util';

export const ENCRYPTION_KEY = Symbol('ENCRYPTION_KEY');

/**
 * 全局加密密钥模块
 *
 * 使用 scryptSync 从 ENCRYPTION_KEY 环境变量派生 AES-256 密钥（仅一次），
 * 供 GiteeAuthService、GitHubAuthService 等需要令牌加密的模块注入使用。
 *
 * 未配置 ENCRYPTION_KEY 时返回 null（明文存储，仅开发环境可接受）。
 */
@Global()
@Module({
  providers: [
    {
      provide: ENCRYPTION_KEY,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.get<string>('ENCRYPTION_KEY');
        return secret ? deriveEncryptionKey(secret) : null;
      },
    },
  ],
  exports: [ENCRYPTION_KEY],
})
export class CryptoModule {}
