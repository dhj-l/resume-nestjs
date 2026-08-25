import { z } from 'zod';

/** 大纲主题 key 字数上限 */
export const OUTLINE_TOPIC_KEY_MAX = 50;
/** 大纲主题标题字数上限 */
export const OUTLINE_TOPIC_TITLE_MAX = 60;
/** 大纲主题描述字数上限 */
export const OUTLINE_TOPIC_DESC_MAX = 150;
/** 大纲主题数量下限 */
export const OUTLINE_TOPIC_COUNT_MIN = 3;
/** 大纲主题数量上限 */
export const OUTLINE_TOPIC_COUNT_MAX = 15;

/**
 * 考察大纲中的单个主题
 */
export interface InterviewOutlineTopic {
  key: string;
  title: string;
  description?: string;
  difficulty?: string;
}

/**
 * AI 生成的考察大纲输出 schema（.passthrough() 容忍未知字段）
 */
export const InterviewOutlineSchema = z
  .object({
    topics: z
      .array(
        z.object({
          key: z.string().min(1).max(OUTLINE_TOPIC_KEY_MAX),
          title: z.string().min(1).max(OUTLINE_TOPIC_TITLE_MAX),
          description: z.string().max(OUTLINE_TOPIC_DESC_MAX).optional(),
          difficulty: z.string().optional(),
        }),
      )
      .min(OUTLINE_TOPIC_COUNT_MIN)
      .max(OUTLINE_TOPIC_COUNT_MAX),
  })
  .passthrough();

export type InterviewOutline = z.infer<typeof InterviewOutlineSchema>;
