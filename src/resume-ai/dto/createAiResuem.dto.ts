import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';
import { DetailInfo, ResumeAiTypeEnum } from '../entities/resume-ai.entity';

export class CreateAiResuemDto {
  /**
   * 解析类型
   */
  @IsEnum(ResumeAiTypeEnum)
  parseType: ResumeAiTypeEnum;

  /**
   * 岗位 JD（用于指导简历生成）
   */
  @IsString()
  @IsNotEmpty()
  jobDescription: string;

  /**
   * 简历模板类型
   */
  @IsString()
  templateType: string;

  /**
   * 简历内容（当解析类型为 upload 时必填）
   */
  @ValidateIf((o) => o.parseType === ResumeAiTypeEnum.Upload)
  @IsString()
  @IsNotEmpty()
  resumeContent?: string;

  /**
   * 详细信息 JSON 字符串（当解析类型为 manual 时必填）
   * 约定结构可参考 DetailInfo 实体定义
   */
  @ValidateIf((o) => o.parseType === ResumeAiTypeEnum.Manual)
  @IsNotEmpty()
  detailInfo?: DetailInfo;

  /**
   * 已存在简历 ID（当解析类型为 select 时必填）
   */
  @ValidateIf((o) => o.parseType === ResumeAiTypeEnum.Select)
  @IsString()
  @IsNotEmpty()
  resumeId?: string;

  /**
   * 需要生成的模块 key 列表（缺省或空数组 = 全部模块）
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  modules?: string[];
}

export class ParserResumeDto {
  /**
   * 模板类型
   */
  @IsString()
  @IsNotEmpty()
  templateType: string;
  /**
   * 模板id
   */
  @IsString()
  @IsNotEmpty()
  templateId: string;
  /**
   * 简历内容
   */
  @IsString()
  @IsNotEmpty()
  resumeContent: string;
}
