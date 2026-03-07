import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type UserDocument = User & Document;

@Schema({
  //自动添加 createdAt 和 updatedAt 字段
  timestamps: true,
})
export class User {
  @Prop({ required: true, unique: true, index: true })
  username: string;

  @Prop({ required: true })
  password: string;

  @Prop({ required: true, unique: true, index: true })
  email: string;

  // 登录失败次数
  @Prop({ default: 0, index: true })
  loginAttempts: number;

  // 账户锁定时间
  @Prop({ index: true })
  lockedUntil?: Date;
}

export const UserSchema = SchemaFactory.createForClass(User);
