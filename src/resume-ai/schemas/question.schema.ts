import { z } from 'zod';

/** 题目字数上限 */
export const QUESTION_TEXT_MAX = 80;
/** 解答字数上限 */
export const ANSWER_TEXT_MAX = 250;
/** 押题数量下限 */
export const QUESTION_COUNT_MIN = 8;
/** 押题数量上限 */
export const QUESTION_COUNT_MAX = 15;

/** 单道面试押题 */
export interface InterviewQuestionItem {
  question: string;
  answer: string;
  category?: string;
  difficulty?: string;
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
          })
          .passthrough(),
      )
      .min(QUESTION_COUNT_MIN)
      .max(QUESTION_COUNT_MAX),
  })
  .passthrough();

export type InterviewQuestionsResult = z.infer<typeof InterviewQuestionSchema>;

/**
 * 归一化并校验 AI 押题结果：
 * - 数量必须精确等于请求的 questionCount（schema 仅保证 8-15 区间）
 * - 每题题目/解答非空且不超字数上限
 * - 统一 trim；category/difficulty 为空时不返回该字段
 */
export function normalizeInterviewQuestions(
  result: unknown,
  questionCount: number,
): InterviewQuestionItem[] {
  const source = (result ?? {}) as { questions?: unknown };
  const questions = Array.isArray(source.questions) ? source.questions : [];
  if (questions.length !== questionCount) {
    throw new Error(
      `押题数量不符：期望 ${questionCount} 道，实际返回 ${questions.length} 道`,
    );
  }
  return questions.map((item) => {
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
    return normalized;
  });
}
