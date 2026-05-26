import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type AiUsageRecordDocument = AiUsageRecord & Document;

export enum AiFunctionEnum {
  /** AI简历生成 */
  ResumeGeneration = 'resume_generation',
  /** AI模块优化 */
  ModuleOptimization = 'module_optimization',
  /** AI简历分析 */
  ResumeAnalysis = 'resume_analysis',
  /** AI智能导入简历 */
  SmartImport = 'smart_import',
}

@Schema({ timestamps: true })
export class AiUsageRecord {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, enum: AiFunctionEnum, index: true })
  aiFunction: string;

  @Prop({ required: true })
  success: boolean;

  @Prop({ type: Number, default: 0 })
  duration: number;

  @Prop({ type: String, default: null })
  errorMessage?: string;

  @Prop({ type: String, default: null, index: true })
  resumeId?: string;

  @Prop({ type: SchemaTypes.Mixed, default: null })
  metadata?: Record<string, any>;
}

export const AiUsageRecordSchema = SchemaFactory.createForClass(AiUsageRecord);
AiUsageRecordSchema.index({ userId: 1, createdAt: -1 });
AiUsageRecordSchema.index({ userId: 1, aiFunction: 1, createdAt: -1 });
