import { BadRequestException } from '@nestjs/common';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
  InterviewModeEnum,
  InterviewStageEnum,
  MAX_MAIN_DURATION_MS,
  MIN_MAIN_DURATION_MS,
  SOFT_MAX_MAIN_QUESTIONS,
} from '../constants/level.constants';
import type { LevelConfig } from '../entities/level-config.entity';

/**
 * 归一化后的面试级别配置（mode/stage/experienceLevel 三维度齐全）。
 * 独立接口而非 Pick<LevelConfig>：LevelConfig 中 mode/stage 为可选
 * （兼容历史会话读取），而归一化结果必须齐全。
 */
export interface ResolvedLevelConfig {
  mode: InterviewModeEnum;
  stage: InterviewStageEnum;
  experienceLevel: ExperienceLevelEnum;
}

/** 创建会话 DTO 中级别配置的原始输入（校验前/归一化前） */
export interface LevelConfigInput {
  mode?: InterviewModeEnum;
  stage?: InterviewStageEnum;
  experienceLevel?: ExperienceLevelEnum;
}

/**
 * 主体考察阶段的结束政策（时长驱动，替代旧版 targetRounds）
 *
 * - cannot_end：不足最短时长，或未超过题数软上限，禁止进入结束环节
 * - can_end：满最短时长且超过题数软上限，AI 可根据候选人表现建议收尾
 * - must_end：达到时长上限，服务端强制进入结束环节
 */
export type EndPolicy = 'cannot_end' | 'can_end' | 'must_end';

/**
 * 兼容历史会话：升级前的会话 levelConfig 只有 focus + experienceLevel，
 * 没有 mode/stage。按既有语义推导：
 * - focus: technical→一面（基础技术面），project/mixed→二面（项目主线延续）
 * - experienceLevel: junior→校招，其余→社招
 */
export function resolveStageConfig(
  levelConfig: LevelConfig,
): ResolvedLevelConfig {
  if (levelConfig.mode && levelConfig.stage) {
    return {
      mode: levelConfig.mode,
      stage: levelConfig.stage,
      experienceLevel: levelConfig.experienceLevel,
    };
  }

  const stage =
    levelConfig.focus === InterviewFocusEnum.Technical
      ? InterviewStageEnum.First
      : InterviewStageEnum.Second;
  const mode =
    levelConfig.experienceLevel === ExperienceLevelEnum.Junior
      ? InterviewModeEnum.Campus
      : InterviewModeEnum.Experienced;

  return { mode, stage, experienceLevel: levelConfig.experienceLevel };
}

/**
 * 归一化创建会话 DTO 的级别配置：
 * - 校招模式：经验层级强制归一为 junior（忽略传入值）
 * - 社招模式：必须显式选择 mid/senior/expert，拒绝 junior
 *
 * 入参允许 undefined：DTO 的 @IsDefined 是第一道防线，这里是任何调用路径
 * （内部复用、后续新增入口）的兜底，保证缺失时是 400 而不是 500。
 */
export function normalizeLevelConfig(
  dto: LevelConfigInput | undefined,
): ResolvedLevelConfig {
  if (!dto?.mode || !dto?.stage) {
    throw new BadRequestException('mode 与 stage 为必填项');
  }
  if (dto.mode === InterviewModeEnum.Campus) {
    return {
      mode: dto.mode,
      stage: dto.stage,
      experienceLevel: ExperienceLevelEnum.Junior,
    };
  }
  if (
    !dto.experienceLevel ||
    dto.experienceLevel === ExperienceLevelEnum.Junior
  ) {
    throw new BadRequestException('社招模式请选择 mid/senior/expert 经验层级');
  }
  return {
    mode: dto.mode,
    stage: dto.stage,
    experienceLevel: dto.experienceLevel,
  };
}

/**
 * 依据主体阶段已进行时长与已问题数得出结束政策
 *
 * 规则（贴近真实大厂面试节奏）：
 * - 满 60 分钟：强制收尾（AI 主动引导进入结束环节）
 * - 不足 30 分钟：禁止收尾，即使题目已很多
 * - 满 30 分钟：题数未超过软上限继续面试；超过后由 AI 根据回答判断
 */
export function resolveEndPolicy(
  elapsedMs: number,
  askedCount: number,
): EndPolicy {
  if (elapsedMs >= MAX_MAIN_DURATION_MS) {
    return 'must_end';
  }
  if (elapsedMs < MIN_MAIN_DURATION_MS) {
    return 'cannot_end';
  }
  return askedCount > SOFT_MAX_MAIN_QUESTIONS ? 'can_end' : 'cannot_end';
}
