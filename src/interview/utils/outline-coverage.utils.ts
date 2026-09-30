import {
  MAIN_PHASE_HARD_STOP_MS,
  QuestionTypeEnum,
} from '../constants/level.constants';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
import type { EndPolicy } from './stage-compat';

/**
 * 尚未覆盖的大纲主题（按大纲原顺序）
 *
 * askedTopicKeys 里还会混入大纲外自主出题的 adhoc_ key，这里按 key 求差集，
 * 只保留真正未考察过的大纲主题。出题引擎（剩余主题注入）与服务层
 * （进入反问的门禁）共用，避免两处判定分叉。
 */
export function remainingOutlineTopics(
  outline: InterviewOutlineTopic[] | undefined,
  askedTopicKeys: string[] | undefined,
): InterviewOutlineTopic[] {
  const asked = askedTopicKeys ?? [];
  return (outline ?? []).filter((topic) => !asked.includes(topic.key));
}

export interface ReverseTransitionInput {
  /** 时长/题数驱动的结束政策 */
  endPolicy: EndPolicy;
  /** AI 本轮是否建议结束主体考察（shouldEndMainPhase） */
  aiRequestsEnd: boolean;
  /** 尚未覆盖的大纲主题数量 */
  remainingCount: number;
  /** 主体阶段已进行毫秒数 */
  elapsedMs: number;
}

/**
 * 是否允许进入反问环节（主体考察结束时唯一的判定入口）
 *
 * 判定顺序即优先级：
 * 1. 硬停止：满 MAIN_PHASE_HARD_STOP_MS 无条件收尾（兜底，防止主题
 *    因模型标注异常永远补不齐而卡死主体阶段）
 * 2. 覆盖前置条件：仍有未覆盖的大纲主题时一律继续出题——「大纲主题
 *    全部覆盖」是进入结束环节的前提，不因时长已到、题数已多或 AI
 *    建议收尾而提前结束（否则会出现 15 个主题只考察 12 个就进入反问）
 * 3. 覆盖完成后按原时长政策：must_end 强制收尾；can_end 时由 AI 决定
 *
 * 候选人主动终止（userRequestedEnd）不经过本判定，由调用方优先处理。
 */
export function shouldEnterReversePhase(
  input: ReverseTransitionInput,
): boolean {
  if (input.elapsedMs >= MAIN_PHASE_HARD_STOP_MS) {
    return true;
  }
  if (input.remainingCount > 0) {
    return false;
  }
  return (
    input.endPolicy === 'must_end' ||
    (input.endPolicy === 'can_end' && input.aiRequestsEnd)
  );
}

/** 各题型推进剩余主题时的兜底提问方式 */
const COVERAGE_QUESTION_HINTS: Record<QuestionTypeEnum, string> = {
  [QuestionTypeEnum.SelfIntro]: '请先做一个简短的自我介绍。',
  [QuestionTypeEnum.Project]:
    '请结合你实际做过的项目，讲讲当时的设计思路、遇到的难点和最后的取舍。',
  [QuestionTypeEnum.Fundamentals]:
    '请讲讲你对这块原理的理解，以及在实际项目里是怎么用的？',
  [QuestionTypeEnum.SystemDesign]:
    '如果让你从头设计一套方案，你会怎么拆解和取舍？',
  [QuestionTypeEnum.OpenQuestion]: '请结合你的经历，聊聊你的思考和实践。',
  [QuestionTypeEnum.Reverse]: '请讲讲你的想法？',
};

/**
 * 推进剩余主题的本地兜底题
 *
 * 仅在模型违反覆盖前置条件（仍有未覆盖主题却想收尾，且没有给出指向
 * 剩余主题的可用题目）时使用：没有 LLM 调用、必然成功，保证服务端
 * 「主题没问完就不收尾」的约束不会被一次模型跑偏破坏。
 */
export function buildCoverageQuestion(topic: InterviewOutlineTopic): string {
  const questionType = Object.values(QuestionTypeEnum).includes(
    topic.questionType as QuestionTypeEnum,
  )
    ? (topic.questionType as QuestionTypeEnum)
    : QuestionTypeEnum.Project;
  return `接下来我们聊一个话题：「${topic.title}」。${COVERAGE_QUESTION_HINTS[questionType]}`;
}
