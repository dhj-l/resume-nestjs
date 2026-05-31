import { z } from 'zod';

/** AI 分析报告 schema */
export const AnalysisSchema = z
  .object({
    meta: z
      .object({
        candidate_name: z.string().optional(),
        target_position: z.string().optional(),
        analysis_version: z.string().optional(),
        analysis_date: z.string().optional(),
      })
      .passthrough()
      .optional(),
    overall_score: z.number().optional(),
    competitiveness_level: z.string().optional(),
    dimension_scores: z
      .array(
        z
          .object({
            name: z.string().optional(),
            score: z.number().optional(),
            max: z.number().optional(),
            weight: z.number().optional(),
            comment: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    strengths: z
      .array(
        z
          .object({
            category: z.string().optional(),
            title: z.string().optional(),
            detail: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    weaknesses: z
      .array(
        z
          .object({
            category: z.string().optional(),
            title: z.string().optional(),
            severity: z.string().optional(),
            detail: z.string().optional(),
            improvement: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    suggestions: z
      .array(
        z
          .object({
            priority: z.string().optional(),
            category: z.string().optional(),
            title: z.string().optional(),
            detail: z.string().optional(),
            effort_estimate: z.string().optional(),
            expected_impact: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    market_analysis: z
      .object({
        competitiveness: z.string().optional(),
        salary_range: z.string().optional(),
        demand_level: z.string().optional(),
        summary: z.string().optional(),
      })
      .passthrough()
      .optional(),
    technology_assessment: z
      .object({
        core_strengths: z.array(z.string()).optional(),
        gaps: z.array(z.string()).optional(),
        recommendations: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    summary: z.string().optional(),
  })
  .passthrough();

export type AIAnalysis = z.infer<typeof AnalysisSchema>;
