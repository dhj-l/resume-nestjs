import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import { LevelConfig, LevelConfigSchema } from './level-config.entity';
import {
  InterviewEndedReasonEnum,
  InterviewPhaseEnum,
  InterviewStatusEnum,
  QuestionTypeEnum,
} from '../constants/level.constants';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';

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

/**
 * 逐题即时反馈子文档（挂在候选人消息上）
 *
 * AI 在每轮回合决策中对候选人刚刚的回答给出的三维度评分与点评。
 */
@Schema({ _id: false })
export class AnswerFeedback {
  /** 完整性：是否覆盖问题要点、有无遗漏关键信息 */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  completeness: number;

  /** 逻辑性：条理、因果、结构化表达 */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  logic: number;

  /** 技术深度：原理理解、细节把握、量化与实战 */
  @Prop({ type: Number, required: true, min: 0, max: 100 })
  depth: number;

  /** 一句话点评：最值得肯定的一点与最需要改进的一点 */
  @Prop({ required: true })
  comment: string;
}

export const AnswerFeedbackSchema =
  SchemaFactory.createForClass(AnswerFeedback);

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
   * 题目类型（取代旧版 isFollowUp 单独追踪的扩展位）
   *
   * 面试官消息 = 该题的考察类型；反问环节候选人提问 = reverse。
   * 旧会话消息缺失该字段，读取时默认按 project（项目主线）处理。
   */
  @Prop({ type: String, enum: QuestionTypeEnum })
  questionType?: QuestionTypeEnum;

  /**
   * 来源渠道（v1 固定 text，为语音扩展预留）
   */
  @Prop({
    type: String,
    default: MessageChannelEnum.Text,
    enum: MessageChannelEnum,
  })
  channel: MessageChannelEnum;

  /**
   * 面试官提问时间
   */
  @Prop()
  askedAt?: Date;

  /**
   * 逐题即时反馈（仅候选人消息，主体考察阶段每题答题后生成）
   */
  @Prop({ type: AnswerFeedbackSchema })
  feedback?: AnswerFeedback;
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
  outline?: InterviewOutlineTopic[];

  /**
   * 当前轮次（从 1 开始，整场面试递增，含反问环节）
   */
  @Prop({ default: 1 })
  currentRound: number;

  /**
   * 会话阶段：main(主体考察) / reverse(反问环节)
   *
   * 结束不再按题目数判定，而由面试时长驱动：
   * 主体阶段满 30 分钟且超过题数软上限后 AI 可建议收尾，满 60 分钟强制收尾，
   * 收尾时进入反问环节。
   */
  @Prop({
    type: String,
    default: InterviewPhaseEnum.Main,
    enum: InterviewPhaseEnum,
  })
  phase: InterviewPhaseEnum;

  /**
   * 目标轮次（旧版字段：旧流程按题目数结束，已被时长驱动机制取代）
   *
   * 仅为读取历史会话保留，新会话不再写入
   */
  @Prop()
  targetRounds?: number;

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
   * 收尾待出报告标记：告别语/收尾回应已落库、评价报告尚未生成
   *
   * 报告链路（长转录 + 思考模式）最长可达 8 分钟且可能失败，此时会话仍是
   * in_progress：该标记让失败后的重试只补生成报告，不重复推进对话轮次
   * （否则同一条回答/反问会二次写入转录并进入报告）。报告落库时清除。
   */
  @Prop({ type: String, enum: InterviewEndedReasonEnum })
  pendingReportReason?: InterviewEndedReasonEnum;

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
