import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';
import type {
  InterviewQuestionItem,
  QuestionFocusArea,
} from '../schemas/question.schema';

export type ResumeQuestionRecordDocument = ResumeQuestionRecord & Document;

/**
 * 面试押题记录状态枚举
 */
export enum QuestionStatusEnum {
  /** 生成中 */
  Generating = 'generating',
  /** 已完成 */
  Completed = 'completed',
  /** 失败 */
  Failed = 'failed',
}

@Schema({ timestamps: true })
export class ResumeQuestionRecord {
  /**
   * 关联的简历ID
   */
  @Prop({ required: true, index: true })
  resumeId: string;

  /**
   * 目标岗位JD
   */
  @Prop({ required: true })
  jobDescription: string;

  /**
   * 手动选择的题目数量（8-15）
   */
  @Prop({ required: true })
  questionCount: number;

  /**
   * 生成时从简历提取的求职岗位（冗余存储，便于展示）
   */
  @Prop({ default: '' })
  targetPosition?: string;

  /**
   * 生成时从简历提取的工作年限（冗余存储，便于展示）
   */
  @Prop({ default: '' })
  workYears?: string;

  /**
   * 生成时从简历提取的候选人姓名（冗余存储，便于展示）
   */
  @Prop({ default: '' })
  candidateName?: string;

  /**
   * 综合押题说明（整体押题思路与最需准备的方向）
   */
  @Prop({ type: String, default: undefined })
  overview?: string;

  /**
   * 重点准备方向
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  focusAreas?: QuestionFocusArea[];

  /**
   * 行业高频考点
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  hotTopics?: string[];

  /**
   * 面试备战建议
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  interviewTips?: string[];

  /**
   * 押题状态
   */
  @Prop({ default: 'generating', enum: QuestionStatusEnum, index: true })
  status: string;

  /**
   * 押题结果（题目数组，每项含 question/answer 及可选 category/difficulty）
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  result?: InterviewQuestionItem[];

  /**
   * 失败原因
   */
  @Prop({ default: undefined })
  failReason?: string;

  /**
   * 用户ID
   */
  @Prop({
    type: SchemaTypes.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: Types.ObjectId;
}

export const ResumeQuestionRecordSchema =
  SchemaFactory.createForClass(ResumeQuestionRecord);
