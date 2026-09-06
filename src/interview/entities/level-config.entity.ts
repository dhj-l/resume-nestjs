import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
  InterviewModeEnum,
  InterviewStageEnum,
} from '../constants/level.constants';

/**
 * 面试级别配置子文档（多维度组合）
 *
 * mode + stage 为核心维度：mode 区分校招/社招，stage 区分一面/二面/三面。
 * 旧版会话仅有 focus + experienceLevel，读取时由 resolveStageConfig 推导。
 */
@Schema({ _id: false })
export class LevelConfig {
  /**
   * 面试模式：campus(校招) / experienced(社招)
   *
   * 新会话由服务端归一化后写入；旧会话缺失时按经验层级推导
   */
  @Prop({ type: String, required: true, enum: InterviewModeEnum })
  mode?: InterviewModeEnum;

  /**
   * 面试轮次：first(一面·基础技术面) / second(二面·项目深入面) / third(三面·综合面)
   *
   * 新会话由服务端写入；旧会话缺失时按旧版 focus 推导
   */
  @Prop({ type: String, required: true, enum: InterviewStageEnum })
  stage?: InterviewStageEnum;

  /**
   * 经验层级：junior(校招) / mid(1-3年) / senior(3-5年) / expert(5年+)
   *
   * campus 模式固定为 junior；experienced 模式仅允许 mid/senior/expert
   */
  @Prop({ type: String, required: true, enum: ExperienceLevelEnum })
  experienceLevel: ExperienceLevelEnum;

  /**
   * 旧版考察侧重字段（已被 stage 取代），仅用于读取历史会话，新会话不写入
   */
  @Prop({ type: String, enum: InterviewFocusEnum })
  focus?: InterviewFocusEnum;
}

export const LevelConfigSchema = SchemaFactory.createForClass(LevelConfig);
