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
    /**
     * 三维度总评分（完整性/逻辑性/技术深度），
     * 与逐题即时反馈同口径；旧报告缺失该字段
     */
    dimensionScores: z
      .object({
        completeness: z.number().min(0).max(100),
        logic: z.number().min(0).max(100),
        depth: z.number().min(0).max(100),
      })
      .optional(),
    /** 反问环节表现评价（未进入反问环节时缺失） */
    reverseFeedback: z
      .object({
        score: z.number().min(0).max(100),
        comment: z.string().max(REPORT_TOPIC_COMMENT_MAX),
      })
      .optional(),
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
