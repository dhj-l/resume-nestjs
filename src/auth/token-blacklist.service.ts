import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

  async addToBlacklist(token: string): Promise<void> {
    try {
      await this.tokenBlacklistModel.create({ token });
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
    const entry = await this.tokenBlacklistModel.findOne({ token }).lean();
    return !!entry;
  }
}
