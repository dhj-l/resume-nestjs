import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';

export type ResumeDocument = Resume & Document;

/**
 * 全局样式配置
 */
@Schema({ _id: false })
export class GlobalStyle {
  /**
   * 字体
   */
  @Prop({ default: '14px' })
  fontSize: string;

  /**
   * 模块上下间距
   */
  @Prop({ default: '14px' })
  moduleMargin: string;

  /**
   * 页面左右间距
   */
  @Prop({ default: '14px' })
  pageMargin: string;

  /**
   * 行高
   */
  @Prop({ default: '1' })
  lineHeight: string;
}

/**
 * 基础信息
 */
@Schema({ _id: false })
export class BasicInfo {
  /**
   * 姓名
   */
  @Prop()
  name: string;

  /**
   * 性别
   */
  @Prop()
  gender: string;

  /**
   * 手机号
   */
  @Prop()
  phone: string;

  /**
   * 年龄
   */
  @Prop()
  age: string;

  /**
   * 邮箱
   */
  @Prop()
  email: string;

  /**
   * 头像
   */
  @Prop()
  avatar: string;

  /**
   * 政治面貌
   */
  @Prop()
  politicalStatus: string;

  /**
   * 工作年限
   */
  @Prop()
  workYear: string;
}

/**
 * 求职意向
 */
@Schema({ _id: false })
export class JobIntention {
  /**
   * 求职意向 例如：前端开发、后端开发、数据分析师等
   */
  @Prop()
  jobIntention: string;

  /**
   * 意向城市
   */
  @Prop()
  intentionCity: string;

  /**
   * 期望薪资
   */
  @Prop()
  expectationSalary: string;

  /**
   * 入职时间
   */
  @Prop()
  entryTime: string;
}

/**
 * 教育背景
 */
@Schema({ _id: false })
export class EducationBackground {
  /**
   * 学校名称
   */
  @Prop()
  schoolName: string;

  /**
   * 学历层次
   */
  @Prop()
  degree: string;

  /**
   * 专业
   */
  @Prop()
  major: string;

  /**
   * 入学时间
   */
  @Prop()
  enrollmentTime: string;

  /**
   * 毕业时间
   */
  @Prop()
  graduationTime: string;

  /**
   * 详细内容
   */
  @Prop()
  content: string;
  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;

  /**
   * 局部排序字段
   */
  @Prop({ default: 0 })
  localSort: number;
}

/**
 * 工作经验
 */
@Schema({ _id: false })
export class WorkExperience {
  /**
   * 公司名称
   */
  @Prop()
  companyName: string;

  /**
   * 职位
   */
  @Prop()
  position: string;

  /**
   * 入职时间
   */
  @Prop()
  workTime: string;

  /**
   * 离职时间
   */
  @Prop()
  dismissalTime: string;

  /**
   * 工作描述
   */
  @Prop()
  workDescription: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;

  /**
   * 局部排序字段
   */
  @Prop({ default: 0 })
  localSort: number;
}

/**
 * 校园经历
 */
@Schema({ _id: false })
export class CampusExperience {
  /**
   * 经历开始时间
   */
  @Prop()
  startTime: string;

  /**
   * 经历结束时间
   */
  @Prop()
  endTime: string;

  /**
   * 经历名称
   */
  @Prop()
  title: string;

  /**
   * 经历描述
   */
  @Prop()
  description: string;

  /**
   * 经历内容
   */
  @Prop()
  content: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;

  /**
   * 局部排序字段
   */
  @Prop({ default: 0 })
  localSort: number;
}

/**
 * 项目经历
 */
@Schema({ _id: false })
export class ProjectExperience {
  /**
   * 项目开始时间
   */
  @Prop()
  startTime: string;

  /**
   * 项目结束时间
   */
  @Prop()
  endTime: string;

  /**
   * 项目名称
   */
  @Prop()
  title: string;

  /**
   * 项目描述
   */
  @Prop()
  description: string;

  /**
   * 项目内容
   */
  @Prop()
  content: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;

  /**
   * 局部排序字段
   */
  @Prop({ default: 0 })
  localSort: number;
}

/**
 * 实习经历
 */
@Schema({ _id: false })
export class InternshipExperience {
  /**
   * 实习开始时间
   */
  @Prop()
  startTime: string;

  /**
   * 实习结束时间
   */
  @Prop()
  endTime: string;

  /**
   * 公司名称
   */
  @Prop()
  companyName: string;

  /**
   * 职位
   */
  @Prop()
  position: string;

  /**
   * 实习描述
   */
  @Prop()
  description: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;

  /**
   * 局部排序字段
   */
  @Prop({ default: 0 })
  localSort: number;
}

/**
 * 技能特长
 */
@Schema({ _id: false })
export class Skills {
  /**
   * 技能内容
   */
  @Prop({ default: '' })
  content: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;
}

/**
 * 荣誉证书
 */
@Schema({ _id: false })
export class Certificates {
  /**
   * 证书内容
   */
  @Prop({ default: '' })
  content: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;
}

/**
 * 自我评价
 */
@Schema({ _id: false })
export class SelfEvaluation {
  /**
   * 评价内容
   */
  @Prop({ default: '' })
  content: string;

  /**
   * 全局排序字段
   */
  @Prop({ default: 0 })
  globalSort: number;
}

/**
 * 简历数据接口
 */
@Schema({ timestamps: true })
export class Resume {
  /**
   * userId
   * 添加索引以提高查询性能
   */
  @Prop({ required: true, index: true })
  userId: string;

  /**
   * user ObjectId
   * 添加索引以提高查询性能
   */
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  user: Types.ObjectId;

  /**
   * 简历标题
   * 添加索引以提高搜索性能
   */
  @Prop({ default: '我的简历', index: true })
  title: string;

  /**
   * 简历全局样式配置
   */
  @Prop({ type: GlobalStyle, default: {} })
  globalStyle: GlobalStyle;

  /**
   * 基础信息
   */
  @Prop({ type: BasicInfo, default: {} })
  basicInfo: BasicInfo;

  /**
   * 求职意向
   */
  @Prop({ type: JobIntention, default: {} })
  jobIntention: JobIntention;

  /**
   * 教育背景
   */
  @Prop({ type: [EducationBackground], default: [] })
  educationBackground: EducationBackground[];

  /**
   * 工作经验
   */
  @Prop({ type: [WorkExperience], default: [] })
  workExperience: WorkExperience[];

  /**
   * 校园经历
   */
  @Prop({ type: [CampusExperience], default: [] })
  campusExperience: CampusExperience[];

  /**
   * 技能特长
   */
  @Prop({ type: Skills, default: {} })
  skills: Skills;

  /**
   * 荣誉证书
   */
  @Prop({ type: Certificates, default: {} })
  certificates: Certificates;

  /**
   * 项目经历
   */
  @Prop({ type: [ProjectExperience], default: [] })
  projectExperience: ProjectExperience[];

  /**
   * 实习经历
   */
  @Prop({ type: [InternshipExperience], default: [] })
  internshipExperience: InternshipExperience[];

  /**
   * 自我评价
   */
  @Prop({ type: SelfEvaluation, default: {} })
  selfEvaluation: SelfEvaluation;

  /**
   * 是否为模板
   * 添加索引以提高查询性能
   */
  @Prop({ default: false, index: true })
  isTemplate: boolean;

  /**
   * 简历封面
   */
  @Prop({ default: '' })
  cover: string;

  /**
   * 简历类型
   * 添加索引以提高查询性能
   */
  @Prop({ default: 'default', index: true })
  type: string;
}

export const ResumeSchema = SchemaFactory.createForClass(Resume);
