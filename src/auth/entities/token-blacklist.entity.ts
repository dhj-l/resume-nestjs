import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TokenBlacklistDocument = TokenBlacklist & Document;

@Schema({ timestamps: false })
export class TokenBlacklist {
  @Prop({ required: true, unique: true, index: true })
  token: string;

  @Prop({ default: Date.now })
  createdAt: Date;
}

export const TokenBlacklistSchema =
  SchemaFactory.createForClass(TokenBlacklist);

TokenBlacklistSchema.index({ createdAt: 1 }, { expireAfterSeconds: 172800 });
