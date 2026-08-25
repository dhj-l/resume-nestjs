import { Type } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
} from '../constants/level.constants';
import { MessageChannelEnum } from '../entities/interview-session.entity';
import { JD_LENGTH_CONSTRAINT } from '../utils/job-description.validator';

/**
 * 面试级别配置 DTO（多维度组合）
 */
export class LevelConfigDto {
  /**
   * 经验层级：junior(校招) / mid(1-3年) / senior(3-5年) / expert(5年+)
   */
  @IsEnum(ExperienceLevelEnum, {
    message: 'experienceLevel 必须是 junior/mid/senior/expert 之一',
  })
  experienceLevel: ExperienceLevelEnum;

  /**
   * 考察侧重：technical(技术面) / project(项目深挖) / mixed(综合)
   */
  @IsEnum(InterviewFocusEnum, {
    message: 'focus 必须是 technical/project/mixed 之一',
  })
  focus: InterviewFocusEnum;
}

/**
 * 创建模拟面试会话 DTO
 */
export class CreateInterviewSessionDto {
  /**
   * 用于面试的简历 ID
   */
  @IsMongoId({ message: 'resumeId 格式不正确' })
  resumeId: string;

  /**
   * 目标岗位 JD
   */
  @IsString()
  @Length(
    JD_LENGTH_CONSTRAINT.minimum,
    JD_LENGTH_CONSTRAINT.maximum,
    {
      message: `JD 内容长度需在 ${JD_LENGTH_CONSTRAINT.minimum}-${JD_LENGTH_CONSTRAINT.maximum} 字符之间`,
    },
  )
  jobDescription: string;

  /**
   * 面试级别配置
   */
  @ValidateNested()
  @Type(() => LevelConfigDto)
  levelConfig: LevelConfigDto;
}

/**
 * 提交面试回答 DTO
 */
export class SubmitAnswerDto {
  /**
   * 回答内容
   */
  @IsString()
  @IsNotEmpty({ message: '回答内容不能为空' })
  @MaxLength(5000, { message: '回答内容最长 5000 字' })
  content: string;

  /**
   * 回答渠道（v1 固定 text，为语音扩展预留）
   */
  @IsOptional()
  @IsEnum(MessageChannelEnum, { message: 'channel 必须是 text/voice 之一' })
  channel?: MessageChannelEnum;
}
