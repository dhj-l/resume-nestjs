import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import {
  LevelConfig,
  LevelConfigSchema,
} from './level-config.entity';
import {
  InterviewEndedReasonEnum,
  InterviewStatusEnum,
} from '../constants/level.constants';

/**
 * 对话消息角色
 */
export enum MessageRoleEnum {
  /** 面试官（AI） */
  Interviewer = 'interviewer',
  /** 候选人（用户） */
  Candidate = 'candidate',
}

/**
 * 消息类别，预留追问等类型扩展
 */
export enum MessageKindEnum {
  Question = 'question',
  Answer = 'answer',
}

/**
 * 消息来源渠道：v1 仅文本；为后续语音通话面试预留 voice
 */
export enum MessageChannelEnum {
  Text = 'text',
  Voice = 'voice',
}

/** 单条对话消息子文档 */
@Schema({ _id: false })
export class InterviewMessage {
  /**
   * 消息角色
   */
  @Prop({ type: String, required: true, enum: MessageRoleEnum })
  role: MessageRoleEnum;

  /**
   * 消息内容
   */
  @Prop({ required: true })
  content: string;

  /**
   * 所属轮次（从 1 开始）
   */
  @Prop({ required: true })
  round: number;

  /**
   * 消息类别
   */
  @Prop({ type: String, required: true, enum: MessageKindEnum })
  kind: MessageKindEnum;

  /**
   * 来源渠道（v1 固定 text，为语音扩展预留）
   */
  @Prop({ type: String, default: MessageChannelEnum.Text, enum: MessageChannelEnum })
  channel: MessageChannelEnum;

  /**
   * 面试官提问时间
   */
  @Prop()
  askedAt?: Date;
}

export const InterviewMessageSchema =
  SchemaFactory.createForClass(InterviewMessage);

export type InterviewSessionDocument = InterviewSession & Document;

/**
 * 模拟面试会话
 *
 * 约束：同一用户同时只能有一个进行中的会话，
 * 通过 partial unique index（status = in_progress 时 userId 唯一）保证。
 */
@Schema({ timestamps: true })
export class InterviewSession {
  /**
   * 所属用户
   */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
  })
  userId: Types.ObjectId;

  /**
   * 用于面试的简历 ID
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Resume', required: true })
  resumeId: Types.ObjectId;

  /**
   * 目标岗位 JD
   */
  @Prop({ required: true })
  jobDescription: string;

  /**
   * 多维度面试级别配置
   */
  @Prop({ type: LevelConfigSchema, required: true })
  levelConfig: LevelConfig;

  /**
   * 会话状态
   */
  @Prop({
    type: String,
    default: InterviewStatusEnum.InProgress,
    enum: InterviewStatusEnum,
    index: true,
  })
  status: InterviewStatusEnum;

  /**
   * 创建时生成的考察大纲
   * 结构：[{ key, title, description, difficulty }]
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  outline?: Record<string, any>[];

  /**
   * 当前轮次（从 1 开始）
   */
  @Prop({ default: 1 })
  currentRound: number;

  /**
   * 目标轮次（由级别维度决定）
   */
  @Prop({ required: true })
  targetRounds: number;

  /**
   * 对话记录
   */
  @Prop({ type: [InterviewMessageSchema], default: [] })
  messages: InterviewMessage[];

  /**
   * 已考察的大纲主题 key 列表（按首次提问顺序）
   */
  @Prop({ type: [String], default: [] })
  askedTopicKeys: string[];

  /**
   * 完成后的评价报告（Zod 校验过的结构化输出）
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  report?: Record<string, any>;

  /**
   * 最近一次活动时间（每次提问/回答刷新）
   */
  @Prop({ required: true, index: true })
  lastActivityAt: Date;

  /**
   * 过期时间：超过该时间仍处于进行中则视为超时关闭
   */
  @Prop({ index: true })
  expiresAt?: Date;

  /**
   * 结束原因
   */
  @Prop({ type: String, enum: InterviewEndedReasonEnum })
  endedReason?: InterviewEndedReasonEnum;

  /**
   * 会话开始时间
   */
  @Prop({ default: () => new Date() })
  startedAt: Date;

  /**
   * 会话结束时间
   */
  @Prop()
  endedAt?: Date;
}

export const InterviewSessionSchema =
  SchemaFactory.createForClass(InterviewSession);

/**
 * 单会话约束：同一用户同时只允许一个进行中的会话
 */
InterviewSessionSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: 'in_progress' } },
);

InterviewSessionSchema.index({ userId: 1, status: 1 });

InterviewSessionSchema.index({ expiresAt: 1, status: 1 });
