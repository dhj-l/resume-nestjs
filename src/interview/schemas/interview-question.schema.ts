import { z } from 'zod';
import { QuestionTypeEnum } from '../constants/level.constants';

/** 题目文本字数上限（对话式提问允许比押题更长） */
export const QUESTION_TEXT_MAX = 400;
/** 出题理由字数上限 */
export const QUESTION_REASON_MAX = 200;
/** 逐题反馈点评字数上限 */
export const FEEDBACK_COMMENT_MAX = 200;

/**
 * 逐题即时反馈
 *
 * 三维度评分（0-100）+ 一句话点评，随回合决策一并生成、零额外调用成本。
 */
export interface AnswerFeedbackResult {
  completeness: number;
  logic: number;
  depth: number;
  comment: string;
}

/**
 * AI 回合决策的输出 schema
 *
 * 每轮答题后一次调用同时产出：
 * - feedback：对候选人刚刚回答的三维度评分与点评
 * - question：下一句话（追问/推进大纲/大纲外自主出题/进入反问环节的收尾引导）
 * - shouldEndMainPhase：是否建议结束主体考察、进入反问环节
 *   （仅当服务端结束政策为 can_end/must_end 时有效）
 */
export const InterviewTurnDecisionSchema = z
  .object({
    feedback: z.object({
      completeness: z.number().min(0).max(100),
      logic: z.number().min(0).max(100),
      depth: z.number().min(0).max(100),
      comment: z.string().min(1).max(FEEDBACK_COMMENT_MAX),
    }),
    /**
     * 本题对应的考察主题 key。出题/追问/自主出题必须携带（追问复用
     * 上一题 key、自主出题 adhoc_ 前缀），仅收尾语可省略——该约束由
     * QuestionEngineService.generateTurn 的 validate 强制，缺失会触发
     * 调用重试，保证主题覆盖追踪（askedTopicKeys）不出现缺口。
     * 模型在收尾时经常输出空字符串而非省略字段，这里把空串归一为
     * undefined，避免结构校验直接失败（生产实测案例）
     */
    topicKey: z.preprocess(
      (value) =>
        typeof value === 'string' && value.trim() === '' ? undefined : value,
      z.string().min(1).optional(),
    ),
    question: z.string().min(1).max(QUESTION_TEXT_MAX),
    questionType: z.enum(QuestionTypeEnum).optional(),
    isFollowUp: z.boolean().optional(),
    shouldEndMainPhase: z.boolean().optional(),
    /**
     * 候选人明确要求终止/放弃本次面试（如有急事、明确表达「不面了」）。
     * 为 true 时服务端无视结束政策，直接以告别语收尾出报告（user_finish），
     * 优先级高于 shouldEndMainPhase 与时长驱动的结束政策
     */
    userRequestedEnd: z.boolean().optional(),
    reason: z.string().max(QUESTION_REASON_MAX).optional(),
  })
  .passthrough();

export type InterviewTurnDecision = z.infer<typeof InterviewTurnDecisionSchema>;
