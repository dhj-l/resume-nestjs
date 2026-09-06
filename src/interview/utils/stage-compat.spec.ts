import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
  InterviewModeEnum,
  InterviewStageEnum,
} from '../constants/level.constants';
import type { LevelConfig } from '../entities/level-config.entity';
import {
  normalizeLevelConfig,
  resolveEndPolicy,
  resolveStageConfig,
} from './stage-compat';

describe('stage-compat - 面试级别配置兼容与结束政策', () => {
  describe('resolveStageConfig', () => {
    it('新会话（已有 mode/stage）原样返回三维配置', () => {
      const config = resolveStageConfig({
        mode: InterviewModeEnum.Experienced,
        stage: InterviewStageEnum.Second,
        experienceLevel: ExperienceLevelEnum.Senior,
      } as LevelConfig);

      expect(config).toEqual({
        mode: InterviewModeEnum.Experienced,
        stage: InterviewStageEnum.Second,
        experienceLevel: ExperienceLevelEnum.Senior,
      });
    });

    it('旧会话无 mode/stage 时按 focus=technical 推导为一面', () => {
      const config = resolveStageConfig({
        focus: InterviewFocusEnum.Technical,
        experienceLevel: ExperienceLevelEnum.Mid,
      } as unknown as LevelConfig);

      expect(config.mode).toBe(InterviewModeEnum.Experienced);
      expect(config.stage).toBe(InterviewStageEnum.First);
      expect(config.experienceLevel).toBe(ExperienceLevelEnum.Mid);
    });

    it('旧会话 focus=project/mixed 推导为二面', () => {
      for (const focus of [
        InterviewFocusEnum.Project,
        InterviewFocusEnum.Mixed,
      ]) {
        const config = resolveStageConfig({
          focus,
          experienceLevel: ExperienceLevelEnum.Senior,
        } as unknown as LevelConfig);
        expect(config.stage).toBe(InterviewStageEnum.Second);
      }
    });

    it('旧会话 experienceLevel=junior 推导为校招模式', () => {
      const config = resolveStageConfig({
        focus: InterviewFocusEnum.Technical,
        experienceLevel: ExperienceLevelEnum.Junior,
      } as unknown as LevelConfig);

      expect(config.mode).toBe(InterviewModeEnum.Campus);
    });
  });

  describe('normalizeLevelConfig', () => {
    it('校招模式强制归一 experienceLevel 为 junior', () => {
      const config = normalizeLevelConfig({
        mode: InterviewModeEnum.Campus,
        stage: InterviewStageEnum.First,
        experienceLevel: ExperienceLevelEnum.Expert,
      });

      expect(config).toEqual({
        mode: InterviewModeEnum.Campus,
        stage: InterviewStageEnum.First,
        experienceLevel: ExperienceLevelEnum.Junior,
      });
    });

    it('校招模式未传 experienceLevel 也归一为 junior', () => {
      const config = normalizeLevelConfig({
        mode: InterviewModeEnum.Campus,
        stage: InterviewStageEnum.Second,
      });

      expect(config.experienceLevel).toBe(ExperienceLevelEnum.Junior);
    });

    it('社招模式合法层级原样保留', () => {
      const config = normalizeLevelConfig({
        mode: InterviewModeEnum.Experienced,
        stage: InterviewStageEnum.Third,
        experienceLevel: ExperienceLevelEnum.Expert,
      });

      expect(config.experienceLevel).toBe(ExperienceLevelEnum.Expert);
    });

    it('社招模式传 junior 抛出 400', () => {
      expect(() =>
        normalizeLevelConfig({
          mode: InterviewModeEnum.Experienced,
          stage: InterviewStageEnum.First,
          experienceLevel: ExperienceLevelEnum.Junior,
        }),
      ).toThrow('社招模式请选择 mid/senior/expert 经验层级');
    });

    it('社招模式缺失 experienceLevel 抛出 400', () => {
      expect(() =>
        normalizeLevelConfig({
          mode: InterviewModeEnum.Experienced,
          stage: InterviewStageEnum.First,
        }),
      ).toThrow('社招模式请选择 mid/senior/expert 经验层级');
    });

    it('缺失 mode 或 stage 抛出 400', () => {
      expect(() => normalizeLevelConfig({})).toThrow('mode 与 stage 为必填项');
      expect(() =>
        normalizeLevelConfig({ mode: InterviewModeEnum.Campus }),
      ).toThrow('mode 与 stage 为必填项');
    });
  });

  describe('resolveEndPolicy - 时长驱动的结束政策', () => {
    const MIN = 30 * 60 * 1000;
    const MAX = 60 * 60 * 1000;

    it('不足 30 分钟时禁止结束（即使题目很多）', () => {
      expect(resolveEndPolicy(MIN - 60_000, 99)).toBe('cannot_end');
      expect(resolveEndPolicy(0, 0)).toBe('cannot_end');
    });

    it('满 30 分钟但未超过题数软上限时继续面试', () => {
      expect(resolveEndPolicy(MIN, 15)).toBe('cannot_end');
      expect(resolveEndPolicy(MIN + 5 * 60_000, 10)).toBe('cannot_end');
    });

    it('满 30 分钟且超过题数软上限时允许 AI 判断', () => {
      expect(resolveEndPolicy(MIN, 16)).toBe('can_end');
      expect(resolveEndPolicy(MAX - 60_000, 20)).toBe('can_end');
    });

    it('满 60 分钟强制结束（优先级最高）', () => {
      expect(resolveEndPolicy(MAX, 10)).toBe('must_end');
      expect(resolveEndPolicy(MAX + 60_000, 0)).toBe('must_end');
    });
  });
});
