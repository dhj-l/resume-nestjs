import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, SchemaTypes, Types } from 'mongoose';

export type ResumeEditRecordDocument = ResumeEditRecord & Document;

@Schema({ timestamps: true })
export class ResumeEditRecord {
  /**
   * 关联的简历ID
   */
  @Prop({ required: true, index: true })
  resumeId: string;

  /**
   * 模块key，如 workExperience, skills 等
   */
  @Prop({ required: true })
  editKey: string;

  /**
   * 数组模块的下标，对象模块为null
   */
  @Prop({ type: Number, default: null })
  editIndex: number | null;

  /**
   * 修改前的内容
   */
  @Prop({ required: true })
  beforeContent: string;

  /**
   * 修改后的内容
   */
  @Prop({ required: true })
  afterContent: string;

  /**
   * 用户ID
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;
}

export const ResumeEditRecordSchema =
  SchemaFactory.createForClass(ResumeEditRecord);
