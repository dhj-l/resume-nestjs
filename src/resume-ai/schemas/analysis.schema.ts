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
    overall_score: z.number().min(0).max(100).optional(),
    competitiveness_level: z.string().optional(),
    dimension_scores: z
      .array(
        z
          .object({
            name: z.string().optional(),
            score: z.number().min(0).optional(),
            max: z.number().min(1).optional(),
            weight: z.number().min(0).max(1).optional(),
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
            description: z.string().optional(),
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
            suggestion: z.string().optional(),
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
            action: z.string().optional(),
            timeline: z.string().optional(),
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
        position_demand: z.string().optional(),
        competition_intensity: z.string().optional(),
        candidate_positioning: z.string().optional(),
        salary_competitiveness_note: z.string().optional(),
      })
      .passthrough()
      .optional(),
    technology_assessment: z
      .object({
        core_strengths: z.array(z.string()).optional(),
        gaps: z.array(z.string()).optional(),
        recommendations: z.array(z.string()).optional(),
        tech_stack_score: z.number().min(0).max(100).optional(),
        tech_stack_summary: z.string().optional(),
        matching_skills: z.array(z.string()).optional(),
        missing_critical_skills: z.array(z.string()).optional(),
        trending_skills_advantage: z.array(z.string()).optional(),
        outdated_or_risk_skills: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    career_analysis: z
      .object({
        career_stage: z.string().optional(),
        trajectory_assessment: z.string().optional(),
        growth_rate: z.string().optional(),
        red_flags: z.array(z.string()).optional(),
        estimated_work_years: z.string().optional(),
      })
      .passthrough()
      .optional(),
    key_findings: z
      .array(
        z
          .object({
            severity: z.string().optional(),
            finding: z.string().optional(),
            detail: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    summary: z.string().optional(),
  })
  .passthrough();

export type AIAnalysis = z.infer<typeof AnalysisSchema>;
