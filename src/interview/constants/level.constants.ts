/**
 * 面试模式 - 校招/社招维度
 *
 * 决定考察核心：校招重潜力与基础，社招重经验与深度。
 */
export enum InterviewModeEnum {
  /** 校招模式（在校生/应届生） */
  Campus = 'campus',
  /** 社招模式（在职工程师） */
  Experienced = 'experienced',
}

/**
 * 面试轮次 - 一面/二面/三面维度
 *
 * 决定面试官人设与考察配比（取代旧版 focus 维度）。
 */
export enum InterviewStageEnum {
  /** 一面：基础技术面（未来同组资深工程师） */
  First = 'first',
  /** 二面：项目深入面/系统设计面（直属 Leader） */
  Second = 'second',
  /** 三面：总监/交叉综合面（技术总监或交叉面试官） */
  Third = 'third',
}

/**
 * 题目类型
 *
 * 大纲主题与每条面试官消息均标注类型，用于分阶段考察与报告分组。
 */
export enum QuestionTypeEnum {
  /** 自我介绍（每场面试的固定开场） */
  SelfIntro = 'self_intro',
  /** 简历项目/实习深挖（主体考察的绝对主线） */
  Project = 'project',
  /** 基础知识八股（网络/操作系统/数据库/语言特性等） */
  Fundamentals = 'fundamentals',
  /** 系统设计 */
  SystemDesign = 'system_design',
  /** 开放性问题（线上排查、技术视野、综合软素质等） */
  OpenQuestion = 'open_question',
  /** 反问环节 */
  Reverse = 'reverse',
}

/**
 * 面试经验层级维度
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
 * 旧版考察侧重维度（已被 stage 轮次维度取代）
 *
 * 仅保留用于读取历史会话数据并在 resolveStageConfig 中做兼容映射，
 * 新会话不再写入该字段。
 */
export enum InterviewFocusEnum {
  /** 技术面 */
  Technical = 'technical',
  /** 项目深挖面 */
  Project = 'project',
  /** 技术与项目综合 */
  Mixed = 'mixed',
}

/** 各面试轮次的 prompt 描述（面试官人设 + 考察配比，注入大纲/出题/反问提示词） */
export const INTERVIEW_STAGE_PROMPTS: Record<InterviewStageEnum, string> = {
  [InterviewStageEnum.First]:
    '一面（基础技术面）：你扮演候选人未来同组的资深工程师，语气务实专业，目标是筛选基本功扎实的候选人。考察配比：开场自我介绍 1 题，简历项目/实习深挖约占 70%（围绕真实经历追问技术选型、难点与结果），八股基础（计算机网络、操作系统、数据库、语言特性，结合 JD 技术栈）约占 30%',
  [InterviewStageEnum.Second]:
    '二面（项目深入面/系统设计面）：你扮演候选人未来的直属 Leader，重在评估解决复杂问题的能力与成长潜力。考察配比：开场自我介绍 1 题，简历项目深挖约占 70%（像剥洋葱一样逐层追问技术选型理由、架构设计、最高难度挑战、性能优化与量化成果），系统设计与开放性问题约占 30%',
  [InterviewStageEnum.Third]:
    '三面（总监/交叉综合面）：你扮演部门技术总监或交叉团队面试官，从更高视角考察架构思维、技术视野与综合素养。考察配比：开场自我介绍 1 题，从简历项目引申至架构设计与技术决策（大规模分布式、跨团队协作、技术选型权衡）约占 60%，技术广度深度与开放性问题（如线上服务突然变慢如何排查）约占 40%',
};

/** 各面试模式的 prompt 描述（校招/社招考察核心差异，注入提示词） */
export const INTERVIEW_MODE_PROMPTS: Record<InterviewModeEnum, string> = {
  [InterviewModeEnum.Campus]:
    '校招模式：候选人是在校生或应届毕业生，考察核心是潜力与基础。基础知识全面且偏原理（是什么/怎么实现），项目/实习深挖重在验证项目真实性与候选人承担的角色，整体关注学习能力、基本功与发展潜力，提问难度应友好且有引导性',
  [InterviewModeEnum.Experienced]:
    '社招模式：候选人是在职工程师，考察核心是经验与深度。八股要结合项目实践、源码原理与场景化追问，项目深挖占比极重（业务架构、技术难点、性能数据与量化成果），整体关注解决实际问题的经验、技术深度与架构能力，提问难度更高',
};

/** 各经验层级的 prompt 描述（用于注入大纲/出题/报告提示词） */
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

/** 主体考察阶段最短时长：不足该时长时禁止进入结束环节（保证面试时长下限） */
export const MIN_MAIN_DURATION_MS = 30 * 60 * 1000;

/** 主体考察阶段最长时长：达到后服务端强制进入结束环节（引导反问收尾） */
export const MAX_MAIN_DURATION_MS = 60 * 60 * 1000;

/**
 * 主体阶段题数软上限：满 30 分钟且题数超过该值后，
 * AI 才可以根据候选人回答判断是否进入结束环节
 */
export const SOFT_MAX_MAIN_QUESTIONS = 15;

/** 反问环节候选人提问数量上限 */
export const MAX_REVERSE_QUESTIONS = 3;

/** 会话不活动超时时长（毫秒）：超过该时长无任何活动自动关闭会话 */
export const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000;

/**
 * 占位会话的大纲生成窗口（毫秒）。
 *
 * 创建会话先落库占位再调 LLM 生成大纲；占位只授予该短窗口的过期时间，
 * 进程崩溃/发布重启残留的占位到期后即可被新建流程的过期检查释放，
 * 不会按完整不活动窗口（45 分钟）阻塞新建面试。大纲回填成功后
 * 过期时间才刷新为完整的 INACTIVITY_TIMEOUT_MS。
 */
export const OUTLINE_FILL_TIMEOUT_MS = 3 * 60 * 1000;

/** 定时清扫过期会话的间隔（毫秒） */
export const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** 会话阶段 */
export enum InterviewPhaseEnum {
  /** 主体考察（自我介绍 + 项目深挖 + 八股/系统设计/开放性） */
  Main = 'main',
  /** 反问环节（候选人提问，面试官回应） */
  Reverse = 'reverse',
}

/** 会话状态 */
export enum InterviewStatusEnum {
  InProgress = 'in_progress',
  Completed = 'completed',
  Cancelled = 'cancelled',
}

/** 会话结束原因 */
export enum InterviewEndedReasonEnum {
  /** 反问环节结束（主体考察完成后引导反问，反问完毕自然结束） */
  Completed = 'completed',
  /** 用户主动收尾（仍生成报告） */
  UserFinish = 'user_finish',
  /** 用户强制中断（不生成报告） */
  UserCancel = 'user_cancel',
  /** 长时间无回复超时关闭（不生成报告） */
  Timeout = 'timeout',
}
