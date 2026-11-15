/**
 * AI 简历分析相关的纯函数工具：输入截断与结果归一化。
 */

export const ANALYSIS_INPUT_BUDGET = 8000;
export const ANALYSIS_INPUT_BUDGET_FALLBACK = 4000;
export const ANALYSIS_TIMEOUT_MS = 120_000;

const ANALYSIS_SECTION_KEYS = [
  'basicInfo',
  'jobIntention',
  'educationBackground',
  'workExperience',
  'projectExperience',
  'skills',
  'certificates',
  'selfEvaluation',
  'campusExperience',
  'internshipExperience',
] as const;

const TRUNCATION_NOTICE = '\n\n[因内容过长已截断，仅保留关键信息]';

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength));
}

function truncateValue(value: unknown, budget: number): unknown {
  if (typeof value === 'string') {
    return truncateText(value, Math.max(1, budget));
  }
  if (Array.isArray(value)) {
    const items: unknown[] = [];
    let used = 0;
    for (const item of value) {
      if (items.length === 0) {
        // 至少保留一条，避免整个章节被丢弃
        items.push(truncateValue(item, Math.max(1, budget)));
        used = JSON.stringify(items).length;
        continue;
      }
      const candidate = truncateValue(item, Math.max(1, budget - used - 2));
      const candidateLength = JSON.stringify(candidate).length + 1;
      if (used + candidateLength > budget) break;
      items.push(candidate);
      used += candidateLength;
    }
    return items;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    const perKey = Math.max(
      1,
      Math.floor(budget / Math.max(1, entries.length)),
    );
    const result: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      result[key] = truncateValue(val, perKey);
    }
    return result;
  }
  return value;
}

/**
 * 组装并截断分析输入。
 *
 * 简历 JSON 超预算时按章节比例分配预算，逐字段/逐条目截断，
 * 保证全部顶层章节都保留；JD 为纯文本，按预算直接截断。
 */
export function buildTruncatedAnalysisContext(
  resume: Record<string, any>,
  jobDescription: string,
  budget = ANALYSIS_INPUT_BUDGET,
): { resumeContent: string; jobDescription: string } {
  const sectionEntries = ANALYSIS_SECTION_KEYS.filter(
    (key) => key in resume,
  ).map((key) => [key, resume[key]] as const);

  const fullContent = JSON.stringify(Object.fromEntries(sectionEntries));
  let resumeContent = fullContent;

  if (fullContent.length > budget) {
    // 预留 JSON 键名/括号开销与截断提示的空间
    const keyOverhead =
      sectionEntries.reduce((sum, [key]) => sum + key.length + 5, 0) + 8;
    const usableBudget = Math.max(
      1,
      Math.floor((budget - TRUNCATION_NOTICE.length) * 0.9) - keyOverhead,
    );
    const fullLength = Math.max(1, fullContent.length);

    const truncated: Record<string, unknown> = {};
    for (const [key, value] of sectionEntries) {
      const share = Math.max(
        1,
        Math.floor((usableBudget * JSON.stringify(value).length) / fullLength),
      );
      truncated[key] = truncateValue(value, share);
    }
    resumeContent = JSON.stringify(truncated) + TRUNCATION_NOTICE;
  }

  const truncatedJd =
    jobDescription.length > budget
      ? truncateText(
          jobDescription,
          Math.max(0, budget - TRUNCATION_NOTICE.length),
        ) + TRUNCATION_NOTICE
      : jobDescription;

  return { resumeContent, jobDescription: truncatedJd };
}

/**
 * 归一化 AI 分析结果：补齐缺失字段的默认值；
 * overall_score 缺失时按维度 score × weight 加权计算。
 */
export function normalizeAnalysisResult(
  result: Record<string, any>,
): Record<string, any> {
  const normalized: Record<string, any> = { ...result };

  normalized.meta = isPlainObject(normalized.meta) ? normalized.meta : {};
  normalized.dimension_scores = Array.isArray(normalized.dimension_scores)
    ? normalized.dimension_scores
    : [];
  normalized.strengths = Array.isArray(normalized.strengths)
    ? normalized.strengths
    : [];
  normalized.weaknesses = Array.isArray(normalized.weaknesses)
    ? normalized.weaknesses
    : [];
  normalized.suggestions = Array.isArray(normalized.suggestions)
    ? normalized.suggestions
    : [];
  normalized.key_findings = Array.isArray(normalized.key_findings)
    ? normalized.key_findings
    : [];
  normalized.market_analysis = isPlainObject(normalized.market_analysis)
    ? normalized.market_analysis
    : {};
  normalized.technology_assessment = isPlainObject(
    normalized.technology_assessment,
  )
    ? normalized.technology_assessment
    : {};
  normalized.career_analysis = isPlainObject(normalized.career_analysis)
    ? normalized.career_analysis
    : {};
  normalized.summary =
    typeof normalized.summary === 'string' ? normalized.summary : '';

  if (
    typeof normalized.overall_score !== 'number' ||
    Number.isNaN(normalized.overall_score)
  ) {
    const computed = computeWeightedScore(normalized.dimension_scores);
    if (computed !== null) {
      normalized.overall_score = computed;
    }
  }

  return normalized;
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function computeWeightedScore(dimensionScores: any[]): number | null {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const item of dimensionScores) {
    if (
      item &&
      typeof item.score === 'number' &&
      typeof item.weight === 'number'
    ) {
      weightedSum += item.score * item.weight;
      weightTotal += item.weight;
    }
  }
  if (weightTotal <= 0) return null;
  return Math.min(100, Math.max(0, Math.round(weightedSum / weightTotal)));
}
