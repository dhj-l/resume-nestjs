import {
  EXPERIENCE_LEVEL_PROMPTS,
  INTERVIEW_MODE_PROMPTS,
  INTERVIEW_STAGE_PROMPTS,
} from '../constants/level.constants';
import type { ResolvedLevelConfig } from './stage-compat';

/**
 * 面试官人设类的提示词变量（出题链与报告链共用）
 *
 * 两个 service 各自拼装过一遍这三个变量，新增级别维度时极易漏改一处；
 * 统一在此组装，保证「出题时的面试官人设」与「报告时的评分基准」同源。
 */
export function buildPersonaVariables(
  levelConfig: ResolvedLevelConfig,
): Record<string, string> {
  return {
    mode_desc: INTERVIEW_MODE_PROMPTS[levelConfig.mode],
    stage_desc: INTERVIEW_STAGE_PROMPTS[levelConfig.stage],
    experience_level_desc:
      EXPERIENCE_LEVEL_PROMPTS[levelConfig.experienceLevel],
  };
}
