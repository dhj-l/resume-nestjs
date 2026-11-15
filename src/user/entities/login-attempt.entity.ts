import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type LoginAttemptDocument = LoginAttempt & Document;

/**
 * 登录失败计数（P0-5）
 *
 * 锁的粒度刻意设计为 (邮箱, 来源)：账号级锁定会让任何知道邮箱的人把真实用户
 * 锁在门外，而 (邮箱, 来源) 只能锁住攻击者自己那条来源。
 *
 * 记录靠 expiresAt 的 TTL 索引自清，不需要额外清理任务。
 */
@Schema({ timestamps: true })
export class LoginAttempt {
  /** 唯一键：`${email}|${scope}`，scope 形如 `ip:1.2.3.4` 或 `shared` */
  @Prop({ required: true, unique: true, index: true })
  key: string;

  /** 邮箱（用于登录成功时整体清空该邮箱在所有来源下的记录） */
  @Prop({ required: true, index: true })
  email: string;

  /** 来源标识：`ip:<地址>`（可信来源）或 `shared`（不可信/缺失来源） */
  @Prop({ required: true })
  scope: string;

  /** 连续失败次数 */
  @Prop({ default: 0 })
  failures: number;

  /**
   * 锁定到期时间。仅在可信来源下才会写入 —— 来源不可信时永不硬锁，
   * 避免 nginx 未配置代理导致所有用户共用一个来源而「一人锁死全体」。
   */
  @Prop()
  lockedUntil?: Date;

  /** TTL：到期后由 MongoDB 自动清理 */
  @Prop({ required: true, index: { expireAfterSeconds: 0 } })
  expiresAt: Date;
}

export const LoginAttemptSchema = SchemaFactory.createForClass(LoginAttempt);
