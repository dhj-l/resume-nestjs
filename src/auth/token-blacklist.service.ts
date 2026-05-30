import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { createHash } from 'crypto';
import {
  TokenBlacklist,
  TokenBlacklistDocument,
} from './entities/token-blacklist.entity';

@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);

  constructor(
    @InjectModel(TokenBlacklist.name)
    private tokenBlacklistModel: Model<TokenBlacklistDocument>,
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private decodeTokenExp(token: string): Date {
    try {
      const payload = JSON.parse(
        Buffer.from(token.split('.')[1], 'base64').toString(),
      );
      if (payload.exp) {
        return new Date(payload.exp * 1000);
      }
    } catch {
      // 解码失败时忽略
    }
    // 默认 48 小时后过期
    return new Date(Date.now() + 172800 * 1000);
  }

  async addToBlacklist(token: string): Promise<void> {
    if (!token) {
      return;
    }
    try {
      const tokenHash = this.hashToken(token);
      const expiresAt = this.decodeTokenExp(token);
      await this.tokenBlacklistModel.create({ token, tokenHash, expiresAt });
      this.logger.log('Token added to blacklist');
    } catch (error: any) {
      if (error.code === 11000) {
        this.logger.warn('Token already in blacklist');
        return;
      }
      this.logger.error(`Failed to add token to blacklist: ${error.message}`);
      throw error;
    }
  }

  async isBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);
    const entry = await this.tokenBlacklistModel.findOne({ tokenHash }).lean();
    return !!entry;
  }
}
