/**
 * 面试级别 - 经验层级维度
 */
export enum ExperienceLevelEnum {
  /** 校招/应届生 */
  Junior = 'junior',
  /** 1-3 年 */
  Mid = 'mid',
  /** 3-5 年 */
  Senior = 'senior',
  /** 5 年以上 */
  Expert = 'expert',
}

/**
 * 面试级别 - 考察侧重维度
 * 后续扩展 HR 面/行为面时在此追加枚举值并补充对应 prompt 描述
 */
export enum InterviewFocusEnum {
  /** 技术面 */
  Technical = 'technical',
  /** 项目深挖面 */
  Project = 'project',
  /** 技术与项目综合 */
  Mixed = 'mixed',
}

/** 各考察侧重的目标轮次（题目数量） */
export const FOCUS_TARGET_ROUNDS: Record<InterviewFocusEnum, number> = {
  [InterviewFocusEnum.Technical]: 8,
  [InterviewFocusEnum.Project]: 6,
  [InterviewFocusEnum.Mixed]: 10,
};

/** 默认目标轮次（枚举映射缺失时的兜底值） */
export const DEFAULT_TARGET_ROUNDS = 8;

/** 各经验层级的 prompt 描述（用于注入大纲/出题提示词） */
export const EXPERIENCE_LEVEL_PROMPTS: Record<ExperienceLevelEnum, string> = {
  [ExperienceLevelEnum.Junior]:
    '在校生或应届毕业生：重点考察基础原理、学习能力、实习与项目细节、成长潜力',
  [ExperienceLevelEnum.Mid]:
    '1-3 年经验：重点考察技术深度、独立交付能力、真实项目难点与解决方案',
  [ExperienceLevelEnum.Senior]:
    '3-5 年经验：重点考察复杂场景设计、性能与稳定性、架构权衡、跨团队协作',
  [ExperienceLevelEnum.Expert]:
    '5 年以上经验：重点考察架构决策、技术选型、团队管理、业务价值与技术影响力',
};

/** 各考察侧重的 prompt 描述 */
export const INTERVIEW_FOCUS_PROMPTS: Record<InterviewFocusEnum, string> = {
  [InterviewFocusEnum.Technical]:
    '技术面试：以 JD 要求的技术能力为主线，覆盖技术基础、原理深度、工程实践与场景设计',
  [InterviewFocusEnum.Project]:
    '项目深挖面试：以候选人简历中的真实项目经历为主线，逐层追问背景、决策、难点、量化结果与反思',
  [InterviewFocusEnum.Mixed]:
    '综合面试：技术与项目深挖结合，先以项目经历切入，再延伸至 JD 相关的技术能力考察',
};

/** AI 建议结束面试前要求的最小轮次（防止误判过早结束） */
export const MIN_ROUNDS_BEFORE_AI_END = 3;

/** 会话不活动超时时长（毫秒）：超过该时长无任何活动自动关闭会话 */
export const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/** 定时清扫过期会话的间隔（毫秒） */
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** 会话状态 */
export enum InterviewStatusEnum {
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

/** 会话结束原因 */
export enum InterviewEndedReasonEnum {
  /** 达到目标轮次自然结束 */
  Completed = 'completed',
  /** AI 引擎判定提前结束 */
  AiSuggest = 'ai_suggest',
  /** 用户主动收尾（仍生成报告） */
  UserFinish = 'user_finish',
  /** 用户强制中断（不生成报告） */
  UserCancel = 'user_cancel',
  /** 长时间无回复超时关闭（不生成报告） */
  Timeout = 'timeout',
}
