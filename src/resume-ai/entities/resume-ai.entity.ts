import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { SchemaTypes, Types } from 'mongoose';

@Schema({
  _id: false,
})
export class DetailInfo {
  /**
   * 姓名
   */
  @Prop({ required: true })
  name: string;
  /**
   * 年龄
   */
  @Prop({ required: true })
  age: number;
  /**
   * 学历
   */
  @Prop({ required: true })
  education: string;
  /**
   * 学校
   */
  @Prop({ required: true })
  school: string;
  /**
   * 专业
   */
  @Prop({ required: true })
  major: string;
  /**
   * 目标岗位
   */
  @Prop({ required: true })
  targetRole: string;
  /**
   * 工作经验
   */
  @Prop({ required: true })
  yearsOfExperience: string;
  /**
   * 补充信息
   */
  @Prop({ required: true })
  supplementary: string;
}

export enum ResumeAiTypeEnum {
  /**
   * 外部上传简历
   */
  Upload = 'upload',
  /**
   * 选择已存在的简历
   */
  Select = 'select',
  /**
   * 手动输入
   */
  Manual = 'manual',
}

export enum ResumeAiStatusEnum {
  /**
   * 创建中
   */
  Creating = 'creating',
  /**
   * 已完成
   */
  Completed = 'completed',
  /**
   * 失败
   */
  Failed = 'failed',
}

@Schema({ timestamps: true })
export class ResumeAi {
  /**
   * 岗位jd
   */
  @Prop({ required: true })
  jobDescription: string;
  /**
   * 状态（创建中，已完成，失败）
   */
  @Prop({ default: 'creating', enum: ResumeAiStatusEnum, index: true })
  status: string;
  /**
   * 简历模板类型
   */
  @Prop({ default: 'default' })
  templateType: string;
  /**
   * 解析类型(外部上传简历, 选择已存在的简历，手动输入)
   */
  @Prop({ required: true, enum: ResumeAiTypeEnum })
  parseType: string;
  /**
   * 简历内容（在外部上传时存在）
   */
  @Prop()
  resumeContent?: string;
  /**
   * 详细信息（在手动输入中存在）
   */
  @Prop()
  detailInfo?: DetailInfo;
  /**
   * 简历id（在选择已存在的简历时存在）
   */
  @Prop()
  resumeId?: string;
  /**
   * 生成的简历id
   */
  @Prop()
  generatedResumeId?: string;
  /**
   * 生成简历的描述（告诉用户为什么要这么生成）
   */
  @Prop({ default: '' })
  generatedResumeDescription?: string;
  /**
   * 用户id，关联用户
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  userId: Types.ObjectId;
  /**
   * 本次生成所选模块（缺省/空数组表示全部模块）
   */
  @Prop({ type: [String], default: [] })
  modules?: string[];
}

export const ResumeAiSchema = SchemaFactory.createForClass(ResumeAi);
export type ResumeAiDocument = ResumeAi & Document;
