import { z } from 'zod';

/** 总评字数上限 */
export const REPORT_COMMENT_MAX = 800;
/** 单主题点评字数上限 */
export const REPORT_TOPIC_COMMENT_MAX = 400;
/** 建议/亮点/不足单条字数上限 */
export const REPORT_ITEM_MAX = 200;
/** 列表条数上限 */
export const REPORT_LIST_MAX = 6;

/**
 * AI 面试评价报告输出 schema
 */
export const InterviewReportSchema = z
  .object({
    overallScore: z.number().min(0).max(100),
    summary: z.string().min(1).max(REPORT_COMMENT_MAX),
    recommendation: z.string().optional(),
    topics: z
      .array(
        z.object({
          topicKey: z.string().min(1),
          title: z.string().optional(),
          score: z.number().min(0).max(100),
          comment: z.string().max(REPORT_TOPIC_COMMENT_MAX),
        }),
      )
      .min(1),
    strengths: z
      .array(z.string().max(REPORT_ITEM_MAX))
      .max(REPORT_LIST_MAX)
      .optional(),
    weaknesses: z
      .array(z.string().max(REPORT_ITEM_MAX))
      .max(REPORT_LIST_MAX)
      .optional(),
    suggestions: z
      .array(z.string().max(REPORT_ITEM_MAX))
      .max(REPORT_LIST_MAX)
      .optional(),
  })
  .passthrough();

export type InterviewReport = z.infer<typeof InterviewReportSchema>;
