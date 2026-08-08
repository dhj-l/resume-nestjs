/**
 * 简历生成模块化prompt索引文件
 * 将大型prompt拆分为多个独立的小型prompt，每个prompt专门负责生成特定模块的JSON格式数据
 */

import { basicInfoPrompt } from './basic-info.prompt';
import { jobIntentionPrompt } from './job-intention.prompt';
import { skillsPrompt } from './skills.prompt';
import { certificatesPrompt } from './certificates.prompt';
import { selfEvaluationPrompt } from './self-evaluation.prompt';
import { educationBackgroundPrompt } from './education-background.prompt';
import { workExperiencePrompt } from './work-experience.prompt';
import { projectExperiencePrompt } from './project-experience.prompt';
import { campusExperiencePrompt } from './campus-experience.prompt';
import { internshipExperiencePrompt } from './internship-experience.prompt';
import { globalStylePrompt } from './global-style.prompt';

// 公共约束
export {
  commonJsonConstraints,
  commonHtmlRules,
  commonDateFormatRules,
  commonSortRules,
  commonEnhancementStrategy,
} from '../common-constraints';

// 各模块prompt
export { basicInfoPrompt } from './basic-info.prompt';
export { jobIntentionPrompt } from './job-intention.prompt';
export { skillsPrompt } from './skills.prompt';
export { certificatesPrompt } from './certificates.prompt';
export { selfEvaluationPrompt } from './self-evaluation.prompt';
export { educationBackgroundPrompt } from './education-background.prompt';
export { workExperiencePrompt } from './work-experience.prompt';
export { projectExperiencePrompt } from './project-experience.prompt';
export { campusExperiencePrompt } from './campus-experience.prompt';
export { internshipExperiencePrompt } from './internship-experience.prompt';
export { globalStylePrompt } from './global-style.prompt';

/**
 * 模块执行顺序配置
 * 按照优先级和依赖关系定义模块的执行顺序
 * 优先级1：基础信息模块（可并行）
 * 优先级2：内容模块（依赖基础信息）
 * 优先级3：经历模块（依赖基础信息）
 */
export const MODULE_EXECUTION_ORDER = [
  // 优先级1：基础信息模块（可并行）
  ['basicInfo', '基础信息'],
  ['jobIntention', '求职意向'],
  ['globalStyle', '全局样式'],

  // 优先级2：内容模块（依赖基础信息）
  ['skills', '技能'],
  ['certificates', '证书'],
  ['selfEvaluation', '自我评价'],

  // 优先级3：经历模块（依赖基础信息）
  ['educationBackground', '教育经历'],
  ['workExperience', '工作经历'],
  ['projectExperience', '项目经历'],
  ['campusExperience', '校园经历'],
  ['internshipExperience', '实习经历'],
] as const;

/**
 * 模块配置对象
 * 包含每个模块的prompt、依赖关系和执行优先级
 */
export const MODULE_PROMPTS = {
  // 基础信息模块（无依赖，可并行执行）
  basicInfo: {
    prompt: basicInfoPrompt,
    dependencies: [],
    priority: 1,
  },
  jobIntention: {
    prompt: jobIntentionPrompt,
    dependencies: [],
    priority: 1,
  },
  globalStyle: {
    prompt: globalStylePrompt,
    dependencies: [],
    priority: 1,
  },

  // 内容模块（依赖基础信息）
  skills: {
    prompt: skillsPrompt,
    dependencies: ['basicInfo'],
    priority: 2,
  },
  certificates: {
    prompt: certificatesPrompt,
    dependencies: ['basicInfo'],
    priority: 2,
  },
  selfEvaluation: {
    prompt: selfEvaluationPrompt,
    dependencies: ['basicInfo', 'skills'],
    priority: 2,
  },

  // 经历模块（依赖基础信息）
  educationBackground: {
    prompt: educationBackgroundPrompt,
    dependencies: ['basicInfo'],
    priority: 3,
  },
  workExperience: {
    prompt: workExperiencePrompt,
    dependencies: ['basicInfo', 'educationBackground'],
    priority: 3,
  },
  projectExperience: {
    prompt: projectExperiencePrompt,
    dependencies: ['basicInfo', 'workExperience'],
    priority: 3,
  },
  campusExperience: {
    prompt: campusExperiencePrompt,
    dependencies: ['basicInfo', 'educationBackground'],
    priority: 3,
  },
  internshipExperience: {
    prompt: internshipExperiencePrompt,
    dependencies: ['basicInfo', 'educationBackground'],
    priority: 3,
  },
} as const;

/**
 * 模块名称类型
 * 从MODULE_PROMPTS中提取所有模块名称
 */
export type ModuleName = keyof typeof MODULE_PROMPTS;

/**
 * 各模块的空默认值（单一来源）
 * 部分模块生成时，未生成的模块用该默认值补齐，保证聚合结果可通过 ResumeSchema 校验。
 * basicInfo 使用 { name: '' } 是因为 ResumeSchema 中 name 为必填字符串。
 */
export const MODULE_DEFAULTS: Record<ModuleName, unknown> = {
  basicInfo: { name: '' },
  jobIntention: {},
  globalStyle: {},
  skills: {},
  certificates: {},
  selfEvaluation: {},
  educationBackground: [],
  workExperience: [],
  projectExperience: [],
  campusExperience: [],
  internshipExperience: [],
};
