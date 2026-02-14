import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { SchemaTypes, Types } from 'mongoose';

@Schema({
  timestamps: true,
})
export class Template {
  /**
   * 模板名称
   */
  @Prop()
  name: string;
  /**
   * 模板预览图URL
   */
  @Prop()
  previewImage: string;
  /**
   * 适用岗位类型
   */
  @Prop()
  category: string;
  /**
   * 使用人数
   */
  @Prop({ default: 0 })
  usedCount: number;
  /**
   * 对应简历,链接到resume表
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Resume', required: true })
  resume: Types.ObjectId;
  @Prop({ required: true })
  resumeId: string;

  /**
   * 创建人ID
   */
  @Prop({ required: true })
  userId: string;
}

export const TemplateSchema = SchemaFactory.createForClass(Template);
export type TemplateDocument = Template & mongoose.Document;
