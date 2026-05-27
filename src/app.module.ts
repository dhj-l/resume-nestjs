import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MongooseModule } from '@nestjs/mongoose';
import { UserModule } from './user/user.module';
import { ResumeModule } from './resume/resume.module';
import { JwtModule } from '@nestjs/jwt';
import { AuthModule } from './auth/auth.module';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UploadModule } from './common/upload/upload.module';
import { TemplateModule } from './template/template.module';
import { AiModule } from './ai/ai.module';
import { ResumeAiModule } from './resume-ai/resume-ai.module';
import { GiteeAuthModule } from './gitee-auth/gitee-auth.module';
import { GitHubAuthModule } from './github-auth/github-auth.module';
import { QQAuthModule } from './qq-auth/qq-auth.module';
import { CryptoModule } from './common/crypto.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 全局速率限制：每个 IP 每 60 秒最多 30 次请求
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
      }),
    }),
    UserModule,
    ResumeModule,
    AuthModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: '2d' },
      }),
      global: true,
    }),
    UploadModule,
    TemplateModule,
    AiModule,
    ResumeAiModule,
    CryptoModule,
    GiteeAuthModule,
    GitHubAuthModule,
    QQAuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
  ],
})
export class AppModule {}
