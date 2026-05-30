import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TokenBlacklistDocument = TokenBlacklist & Document;

@Schema({ timestamps: false })
export class TokenBlacklist {
  @Prop({ required: true })
  token: string;

  @Prop({ required: true, unique: true, index: true })
  tokenHash: string;

  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export const TokenBlacklistSchema =
  SchemaFactory.createForClass(TokenBlacklist);
