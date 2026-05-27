import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { MongooseModule } from '@nestjs/mongoose';
import { JwtStrategy } from './strategies/jwt.strategy';
import { TokenBlacklistService } from './token-blacklist.service';
import {
  TokenBlacklist,
  TokenBlacklistSchema,
} from './entities/token-blacklist.entity';

@Module({
  imports: [
    PassportModule,
    MongooseModule.forFeature([
      { name: TokenBlacklist.name, schema: TokenBlacklistSchema },
    ]),
  ],
  providers: [JwtStrategy, TokenBlacklistService],
  exports: [TokenBlacklistService],
})
export class AuthModule {}
