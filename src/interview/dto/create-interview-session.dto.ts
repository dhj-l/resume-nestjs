import { Type } from 'class-transformer';
import {
  IsEnum,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import {
  ExperienceLevelEnum,
  InterviewModeEnum,
  InterviewStageEnum,
} from '../constants/level.constants';
import { MessageChannelEnum } from '../entities/interview-session.entity';
import { JD_LENGTH_CONSTRAINT } from '../utils/job-description.validator';

/**
 * 面试级别配置 DTO（多维度组合）
 *
 * mode + stage 决定面试官人设与考察配比；
 * 校招模式经验层级固定为 junior（服务端归一化），社招模式必须显式选择。
 */
export class LevelConfigDto {
  /**
   * 面试模式：campus(校招) / experienced(社招)
   */
  @IsEnum(InterviewModeEnum, {
    message: 'mode 必须是 campus/experienced 之一',
  })
  mode: InterviewModeEnum;

  /**
   * 面试轮次：first(一面·基础技术面) / second(二面·项目深入面) / third(三面·综合面)
   */
  @IsEnum(InterviewStageEnum, {
    message: 'stage 必须是 first/second/third 之一',
  })
  stage: InterviewStageEnum;

  /**
   * 经验层级：mid(1-3年) / senior(3-5年) / expert(5年+)
   *
   * 社招模式必填；校招模式无需传（服务端固定 junior）
   */
  @ValidateIf((o) => o.mode === InterviewModeEnum.Experienced)
  @IsEnum(ExperienceLevelEnum, {
    message: 'experienceLevel 必须是 junior/mid/senior/expert 之一',
  })
  @IsNotEmpty({ message: '社招模式必须选择经验层级（mid/senior/expert）' })
  experienceLevel?: ExperienceLevelEnum;
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
  @Length(JD_LENGTH_CONSTRAINT.minimum, JD_LENGTH_CONSTRAINT.maximum, {
    message: `JD 内容长度需在 ${JD_LENGTH_CONSTRAINT.minimum}-${JD_LENGTH_CONSTRAINT.maximum} 字符之间`,
  })
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
   * 回答内容（主体考察阶段为回答；反问环节为候选人提出的问题）
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
