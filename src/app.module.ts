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
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { UserThrottlerGuard } from './common/guards/user-throttler.guard';
import { UploadModule } from './common/upload/upload.module';
import { TemplateModule } from './template/template.module';
import { AiModule } from './ai/ai.module';
import { ResumeAiModule } from './resume-ai/resume-ai.module';
import { GiteeAuthModule } from './gitee-auth/gitee-auth.module';
import { GitHubAuthModule } from './github-auth/github-auth.module';
import { QQAuthModule } from './qq-auth/qq-auth.module';
import { CryptoModule } from './common/crypto.module';
import { AdminModule } from './admin/admin.module';
import { InterviewModule } from './interview/interview.module';

/** 解析正整数环境变量，非法/缺失时回退默认值（避免被空串解析成 0 而全民 429） */
function parsePositiveInt(raw: unknown, fallback: number): number {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    // 全局限流：默认每个计数主体（已登录按 userId，未登录按 IP）
    // 在每个路由上每 60 秒 120 次；可用 THROTTLE_TTL_MS / THROTTLE_LIMIT 调整。
    // 具体某个端点可以用 @Throttle 单独收紧（登录/OAuth/面试/AI 已各设为 10 次/分钟）。
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: parsePositiveInt(config.get<string>('THROTTLE_TTL_MS'), 60000),
          limit: parsePositiveInt(config.get<string>('THROTTLE_LIMIT'), 120),
        },
      ],
    }),

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
    AdminModule,
    InterviewModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      // 全局限流守卫：必须显式注册，否则 ThrottlerModule 与 @Throttle 都是死配置
      provide: APP_GUARD,
      useClass: UserThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
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
