import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ResumeAnalysisRecordDocument = ResumeAnalysisRecord & Document;

/**
 * 简历分析状态枚举
 */
export enum AnalysisStatusEnum {
  /** 分析中 */
  Analyzing = 'analyzing',
  /** 已完成 */
  Completed = 'completed',
  /** 失败 */
  Failed = 'failed',
}

@Schema({ timestamps: true })
export class ResumeAnalysisRecord {
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
   * 分析状态
   */
  @Prop({ default: 'analyzing', enum: AnalysisStatusEnum, index: true })
  status: string;

  /**
   * AI分析结果（完整JSON）
   */
  @Prop({ type: SchemaTypes.Mixed, default: undefined })
  analysisResult?: Record<string, any>;

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

export const ResumeAnalysisRecordSchema =
  SchemaFactory.createForClass(ResumeAnalysisRecord);
