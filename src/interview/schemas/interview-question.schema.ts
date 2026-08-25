import { z } from 'zod';

/** 题目文本字数上限（对话式提问允许比押题更长） */
export const QUESTION_TEXT_MAX = 400;
/** 出题理由字数上限 */
export const QUESTION_REASON_MAX = 200;

/**
 * AI 下一题决策的输出 schema
 *
 * 每轮根据大纲与对话历史生成：
 * - topicKey：本题对应的考察主题
 * - question：具体面试问题（含追问）
 * - isFollowUp：是否针对上一轮回答的追问
 * - shouldEndInterview：引擎是否建议结束面试
 * - reason：出题/结束的理由
 */
export const InterviewQuestionDecisionSchema = z
  .object({
    topicKey: z.string().min(1),
    question: z.string().min(1).max(QUESTION_TEXT_MAX),
    isFollowUp: z.boolean(),
    shouldEndInterview: z.boolean().optional(),
    reason: z.string().max(QUESTION_REASON_MAX).optional(),
  })
  .passthrough();

export type InterviewQuestionDecision = z.infer<
  typeof InterviewQuestionDecisionSchema
>;
