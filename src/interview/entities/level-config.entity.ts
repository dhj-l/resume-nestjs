import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
} from '../constants/level.constants';

/**
 * 面试级别配置子文档（多维度组合）
 * 后续扩展新维度（如面试轮次类型）时在此追加字段
 */
@Schema({ _id: false })
export class LevelConfig {
  /**
   * 经验层级：junior(校招) / mid(1-3年) / senior(3-5年) / expert(5年+)
   */
  @Prop({ type: String, required: true, enum: ExperienceLevelEnum })
  experienceLevel: ExperienceLevelEnum;

  /**
   * 考察侧重：technical(技术面) / project(项目深挖) / mixed(综合)
   */
  @Prop({ type: String, required: true, enum: InterviewFocusEnum })
  focus: InterviewFocusEnum;
}

export const LevelConfigSchema = SchemaFactory.createForClass(LevelConfig);
