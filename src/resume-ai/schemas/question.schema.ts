import { z } from 'zod';

/** 题目字数上限 */
export const QUESTION_TEXT_MAX = 80;
/** 解答字数上限 */
export const ANSWER_TEXT_MAX = 400;
/** 押题数量下限 */
export const QUESTION_COUNT_MIN = 8;
/** 押题数量上限 */
export const QUESTION_COUNT_MAX = 15;
/** 每题关键词条数上限 */
export const KEYWORDS_MAX_COUNT = 8;
/** 单个关键词字数上限 */
export const KEYWORD_TEXT_MAX = 20;
/** 追问字数上限 */
export const FOLLOW_UP_TEXT_MAX = 60;
/** 考察点字数上限 */
export const EVALUATION_POINT_TEXT_MAX = 60;
/** 综合押题说明字数上限 */
export const OVERVIEW_TEXT_MAX = 200;
/** 重点准备方向条数上限 */
export const FOCUS_AREAS_MAX_COUNT = 4;
/** 方向名称字数上限 */
export const FOCUS_AREA_TEXT_MAX = 20;
/** 方向理由字数上限 */
export const FOCUS_REASON_TEXT_MAX = 80;
/** 行业高频考点条数上限 */
export const HOT_TOPICS_MAX_COUNT = 6;
/** 单个考点字数上限 */
export const HOT_TOPIC_TEXT_MAX = 30;
/** 备战建议条数上限 */
export const INTERVIEW_TIPS_MAX_COUNT = 5;
/** 单条建议字数上限 */
export const INTERVIEW_TIP_TEXT_MAX = 80;

/** 单道面试押题 */
export interface InterviewQuestionItem {
  question: string;
  answer: string;
  category?: string;
  difficulty?: string;
  keywords?: string[];
  followUp?: string;
  evaluationPoint?: string;
}

/** 重点准备方向 */
export interface QuestionFocusArea {
  area: string;
  reason: string;
}

/** 归一化后的押题结果（题目数组 + 记录级汇总） */
export interface NormalizedQuestionResult {
  questions: InterviewQuestionItem[];
  overview?: string;
  focusAreas?: QuestionFocusArea[];
  hotTopics?: string[];
  interviewTips?: string[];
}

/** AI 面试押题输出 schema（题目数量 8-15，题目/解答字数受限） */
export const InterviewQuestionSchema = z
  .object({
    questions: z
      .array(
        z
          .object({
            question: z.string().min(1).max(QUESTION_TEXT_MAX),
            answer: z.string().min(1).max(ANSWER_TEXT_MAX),
            category: z.string().optional(),
            difficulty: z.string().optional(),
            keywords: z
              .array(z.string().max(KEYWORD_TEXT_MAX))
              .max(KEYWORDS_MAX_COUNT)
              .optional(),
            followUp: z.string().max(FOLLOW_UP_TEXT_MAX).optional(),
            evaluationPoint: z
              .string()
              .max(EVALUATION_POINT_TEXT_MAX)
              .optional(),
          })
          .passthrough(),
      )
      .min(QUESTION_COUNT_MIN)
      .max(QUESTION_COUNT_MAX),
    overview: z.string().max(OVERVIEW_TEXT_MAX).optional(),
    focusAreas: z
      .array(
        z
          .object({
            area: z.string().max(FOCUS_AREA_TEXT_MAX),
            reason: z.string().max(FOCUS_REASON_TEXT_MAX),
          })
          .passthrough(),
      )
      .max(FOCUS_AREAS_MAX_COUNT)
      .optional(),
    hotTopics: z
      .array(z.string().max(HOT_TOPIC_TEXT_MAX))
      .max(HOT_TOPICS_MAX_COUNT)
      .optional(),
    interviewTips: z
      .array(z.string().max(INTERVIEW_TIP_TEXT_MAX))
      .max(INTERVIEW_TIPS_MAX_COUNT)
      .optional(),
  })
  .passthrough();

export type InterviewQuestionsResult = z.infer<typeof InterviewQuestionSchema>;

function trimString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown, maxCount: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => trimString(item))
    .filter(Boolean)
    .slice(0, maxCount);
}

/**
 * 归一化并校验 AI 押题结果：
 * - 数量必须精确等于请求的 questionCount（schema 仅保证 8-15 区间）
 * - 每题题目/解答非空且不超字数上限
 * - 统一 trim；category/difficulty/keywords/followUp/evaluationPoint 为空时不返回该字段
 * - 记录级汇总字段（overview/focusAreas/hotTopics/interviewTips）同样归一化
 */
export function normalizeInterviewQuestions(
  result: unknown,
  questionCount: number,
): NormalizedQuestionResult {
  const source = (result ?? {}) as Record<string, unknown>;
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (questions.length !== questionCount) {
    throw new Error(
      `押题数量不符：期望 ${questionCount} 道，实际返回 ${questions.length} 道`,
    );
  }
  const normalizedQuestions = questions.map((item) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const question =
      typeof raw.question === 'string' ? raw.question.trim() : '';
    const answer = typeof raw.answer === 'string' ? raw.answer.trim() : '';
    if (!question) {
      throw new Error('押题结果存在空题目');
    }
    if (question.length > QUESTION_TEXT_MAX) {
      throw new Error(`题目超过 ${QUESTION_TEXT_MAX} 字上限`);
    }
    if (!answer) {
      throw new Error('押题结果存在空解答');
    }
    if (answer.length > ANSWER_TEXT_MAX) {
      throw new Error(`解答超过 ${ANSWER_TEXT_MAX} 字上限`);
    }
    const normalized: InterviewQuestionItem = { question, answer };
    if (typeof raw.category === 'string' && raw.category.trim()) {
      normalized.category = raw.category.trim();
    }
    if (typeof raw.difficulty === 'string' && raw.difficulty.trim()) {
      normalized.difficulty = raw.difficulty.trim();
    }
    const keywords = normalizeStringArray(raw.keywords, KEYWORDS_MAX_COUNT);
    if (keywords.length > 0) {
      normalized.keywords = keywords;
    }
    const followUp = trimString(raw.followUp);
    if (followUp) {
      normalized.followUp = followUp;
    }
    const evaluationPoint = trimString(raw.evaluationPoint);
    if (evaluationPoint) {
      normalized.evaluationPoint = evaluationPoint;
    }
    return normalized;
  });

  const normalized: NormalizedQuestionResult = {
    questions: normalizedQuestions,
  };

  const overview = trimString(source.overview);
  if (overview) {
    normalized.overview = overview;
  }

  const focusAreas = (Array.isArray(source.focusAreas) ? source.focusAreas : [])
    .map((item) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const area = trimString(raw.area);
      const reason = trimString(raw.reason);
      return area && reason ? { area, reason } : null;
    })
    .filter((item): item is QuestionFocusArea => item !== null)
    .slice(0, FOCUS_AREAS_MAX_COUNT);
  if (focusAreas.length > 0) {
    normalized.focusAreas = focusAreas;
  }

  const hotTopics = normalizeStringArray(
    source.hotTopics,
    HOT_TOPICS_MAX_COUNT,
  );
  if (hotTopics.length > 0) {
    normalized.hotTopics = hotTopics;
  }

  const interviewTips = normalizeStringArray(
    source.interviewTips,
    INTERVIEW_TIPS_MAX_COUNT,
  );
  if (interviewTips.length > 0) {
    normalized.interviewTips = interviewTips;
  }

  return normalized;
}
