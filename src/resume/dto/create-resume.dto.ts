import {
  IsString,
  IsOptional,
  ValidateNested,
  IsArray,
  IsNumber,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 全局样式配置 DTO
 */
export class GlobalStyleDto {
  @IsString({ message: '字体大小必须是字符串' })
  @IsOptional()
  fontSize?: string;

  @IsString({ message: '模块间距必须是字符串' })
  @IsOptional()
  moduleMargin?: string;

  @IsString({ message: '页面边距必须是字符串' })
  @IsOptional()
  pageMargin?: string;

  @IsString({ message: '行高必须是字符串' })
  @IsOptional()
  lineHeight?: string;
}

/**
 * 基础信息 DTO
 */
export class BasicInfoDto {
  @IsString({ message: '姓名必须是字符串' })
  @IsOptional()
  name?: string;

  @IsString({ message: '性别必须是字符串' })
  @IsOptional()
  gender?: string;

  @IsString({ message: '手机号必须是字符串' })
  @IsOptional()
  phone?: string;

  @IsString({ message: '年龄必须是字符串' })
  @IsOptional()
  age?: string;

  @IsString({ message: '邮箱必须是字符串' })
  @IsOptional()
  email?: string;

  @IsString({ message: '头像必须是字符串' })
  @IsOptional()
  avatar?: string;

  @IsString({ message: '政治面貌必须是字符串' })
  @IsOptional()
  politicalStatus?: string;

  @IsString({ message: '工作年限必须是字符串' })
  @IsOptional()
  workYear?: string;
}

/**
 * 求职意向 DTO
 */
export class JobIntentionDto {
  @IsString({ message: '求职意向必须是字符串' })
  @IsOptional()
  jobIntention?: string;

  @IsString({ message: '意向城市必须是字符串' })
  @IsOptional()
  intentionCity?: string;

  @IsString({ message: '期望薪资必须是字符串' })
  @IsOptional()
  expectationSalary?: string;

  @IsString({ message: '入职时间必须是字符串' })
  @IsOptional()
  entryTime?: string;
}

/**
 * 教育背景 DTO
 */
export class EducationBackgroundDto {
  @IsString({ message: '学校名称必须是字符串' })
  @IsOptional()
  schoolName?: string;

  @IsString({ message: '学历必须是字符串' })
  @IsOptional()
  degree?: string;

  @IsString({ message: '专业必须是字符串' })
  @IsOptional()
  major?: string;

  @IsString({ message: '入学时间必须是字符串' })
  @IsOptional()
  enrollmentTime?: string;

  @IsString({ message: '毕业时间必须是字符串' })
  @IsOptional()
  graduationTime?: string;

  @IsString({ message: '详细内容必须是字符串' })
  @IsOptional()
  content?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;

  @IsNumber({}, { message: '局部排序必须是数字' })
  @IsOptional()
  localSort?: number;
}

/**
 * 工作经验 DTO
 */
export class WorkExperienceDto {
  @IsString({ message: '公司名称必须是字符串' })
  @IsOptional()
  companyName?: string;

  @IsString({ message: '职位必须是字符串' })
  @IsOptional()
  position?: string;

  @IsString({ message: '入职时间必须是字符串' })
  @IsOptional()
  workTime?: string;

  @IsString({ message: '离职时间必须是字符串' })
  @IsOptional()
  dismissalTime?: string;

  @IsString({ message: '工作描述必须是字符串' })
  @IsOptional()
  workDescription?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;

  @IsNumber({}, { message: '局部排序必须是数字' })
  @IsOptional()
  localSort?: number;
}

/**
 * 校园经历 DTO
 */
export class CampusExperienceDto {
  @IsString({ message: '开始时间必须是字符串' })
  @IsOptional()
  startTime?: string;

  @IsString({ message: '结束时间必须是字符串' })
  @IsOptional()
  endTime?: string;

  @IsString({ message: '经历名称必须是字符串' })
  @IsOptional()
  title?: string;

  @IsString({ message: '经历描述必须是字符串' })
  @IsOptional()
  description?: string;

  @IsString({ message: '经历内容必须是字符串' })
  @IsOptional()
  content?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;

  @IsNumber({}, { message: '局部排序必须是数字' })
  @IsOptional()
  localSort?: number;
}

/**
 * 项目经历 DTO
 */
export class ProjectExperienceDto {
  @IsString({ message: '项目开始时间必须是字符串' })
  @IsOptional()
  startTime?: string;

  @IsString({ message: '项目结束时间必须是字符串' })
  @IsOptional()
  endTime?: string;

  @IsString({ message: '项目名称必须是字符串' })
  @IsOptional()
  title?: string;

  @IsString({ message: '项目描述必须是字符串' })
  @IsOptional()
  description?: string;

  @IsString({ message: '项目内容必须是字符串' })
  @IsOptional()
  content?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;

  @IsNumber({}, { message: '局部排序必须是数字' })
  @IsOptional()
  localSort?: number;
}

/**
 * 实习经历 DTO
 */
export class InternshipExperienceDto {
  @IsString({ message: '实习开始时间必须是字符串' })
  @IsOptional()
  startTime?: string;

  @IsString({ message: '实习结束时间必须是字符串' })
  @IsOptional()
  endTime?: string;

  @IsString({ message: '公司名称必须是字符串' })
  @IsOptional()
  companyName?: string;

  @IsString({ message: '职位必须是字符串' })
  @IsOptional()
  position?: string;

  @IsString({ message: '实习描述必须是字符串' })
  @IsOptional()
  description?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;

  @IsNumber({}, { message: '局部排序必须是数字' })
  @IsOptional()
  localSort?: number;
}

/**
 * 技能特长 DTO
 */
export class SkillsDto {
  @IsString({ message: '技能内容必须是字符串' })
  @IsOptional()
  content?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;
}

/**
 * 荣誉证书 DTO
 */
export class CertificatesDto {
  @IsString({ message: '证书内容必须是字符串' })
  @IsOptional()
  content?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;
}

/**
 * 自我评价 DTO
 */
export class SelfEvaluationDto {
  @IsString({ message: '评价内容必须是字符串' })
  @IsOptional()
  content?: string;

  @IsNumber({}, { message: '全局排序必须是数字' })
  @IsOptional()
  globalSort?: number;
}

/**
 * 创建简历 DTO
 */
export class CreateResumeDto {
  @IsString({ message: '模板 ID 必须是字符串' })
  @IsOptional()
  templateId?: string;

  @IsString({ message: '简历标题必须是字符串' })
  @IsOptional()
  @MinLength(1, { message: '简历标题长度至少为1位' })
  @MaxLength(100, { message: '简历标题长度不能超过100位' })
  title?: string;

  @ValidateNested({ message: '全局样式配置格式不正确' })
  @Type(() => GlobalStyleDto)
  @IsOptional()
  globalStyle?: GlobalStyleDto;

  @ValidateNested({ message: '基础信息格式不正确' })
  @Type(() => BasicInfoDto)
  @IsOptional()
  basicInfo?: BasicInfoDto;

  @ValidateNested({ message: '求职意向格式不正确' })
  @Type(() => JobIntentionDto)
  @IsOptional()
  jobIntention?: JobIntentionDto;

  @IsArray({ message: '教育背景必须是数组' })
  @ValidateNested({ each: true, message: '教育背景项格式不正确' })
  @Type(() => EducationBackgroundDto)
  @IsOptional()
  educationBackground?: EducationBackgroundDto[];

  @IsArray({ message: '工作经验必须是数组' })
  @ValidateNested({ each: true, message: '工作经验项格式不正确' })
  @Type(() => WorkExperienceDto)
  @IsOptional()
  workExperience?: WorkExperienceDto[];

  @IsArray({ message: '校园经历必须是数组' })
  @ValidateNested({ each: true, message: '校园经历项格式不正确' })
  @Type(() => CampusExperienceDto)
  @IsOptional()
  campusExperience?: CampusExperienceDto[];

  @ValidateNested({ message: '技能特长格式不正确' })
  @Type(() => SkillsDto)
  @IsOptional()
  skills?: SkillsDto;

  @ValidateNested({ message: '荣誉证书格式不正确' })
  @Type(() => CertificatesDto)
  @IsOptional()
  certificates?: CertificatesDto;

  @IsArray({ message: '项目经历必须是数组' })
  @ValidateNested({ each: true, message: '项目经历项格式不正确' })
  @Type(() => ProjectExperienceDto)
  @IsOptional()
  projectExperience?: ProjectExperienceDto[];

  @IsArray({ message: '实习经历必须是数组' })
  @ValidateNested({ each: true, message: '实习经历项格式不正确' })
  @Type(() => InternshipExperienceDto)
  @IsOptional()
  internshipExperience?: InternshipExperienceDto[];

  @ValidateNested({ message: '自我评价格式不正确' })
  @Type(() => SelfEvaluationDto)
  @IsOptional()
  selfEvaluation?: SelfEvaluationDto;

  /**
   * 简历模板类型
   */
  @IsString({ message: '简历类型必须是字符串' })
  @IsOptional()
  type?: string;
}
