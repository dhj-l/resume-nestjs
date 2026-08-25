import {
  JD_KEYWORD_GROUPS,
  MAX_LENGTH,
  MIN_CHINESE_LENGTH,
  MIN_ENGLISH_LENGTH,
  MIN_LINE_BREAKS,
  MIN_PARAGRAPHS,
  VALIDATION_MESSAGES,
  fuzzyMatch,
} from 'src/resume-ai/constants/job-validation.constants';

/**
 * 校验岗位 JD 是否可用于模拟面试（与简历分析共用校验规则）
 *
 * 复用 resume-ai 的 JD 校验常量与关键词匹配逻辑，
 * 以纯函数形式提供，避免对 ResumeAiService 的模块耦合。
 */
export function validateJobDescriptionText(jobDescription: string): {
  isValid: boolean;
  reason?: string;
} {
  const messages = VALIDATION_MESSAGES.CN;
  const length = jobDescription.length;

  if (length > MAX_LENGTH) {
    return { isValid: false, reason: messages.tooLong };
  }

  const chineseCharCount = (jobDescription.match(/[\u4e00-\u9fa5]/g) || [])
    .length;
  const isChineseDominant = chineseCharCount > length * 0.3;
  const effectiveMinLength = isChineseDominant
    ? MIN_CHINESE_LENGTH
    : MIN_ENGLISH_LENGTH;

  if (length < effectiveMinLength) {
    return { isValid: false, reason: messages.tooShort };
  }

  const paragraphs = jobDescription
    .split(/\n\s*\n/)
    .filter((p) => p.trim().length > 0);
  const lineBreaks = (jobDescription.match(/\n/g) || []).length;

  if (paragraphs.length < MIN_PARAGRAPHS && lineBreaks < MIN_LINE_BREAKS) {
    return { isValid: false, reason: messages.insufficientParagraphs };
  }

  let matchedGroups = 0;
  for (const group of JD_KEYWORD_GROUPS) {
    const matched =
      group.keywords.some((keyword) => fuzzyMatch(jobDescription, keyword)) ||
      group.synonyms.some((synonymGroup) =>
        synonymGroup.some((synonym) => fuzzyMatch(jobDescription, synonym)),
      );
    if (matched) {
      matchedGroups++;
    }
  }

  // 与现有押题/分析保持一致：至少命中 3 组关键字段
  if (matchedGroups < 3) {
    return { isValid: false, reason: messages.missingKeywords };
  }

  return { isValid: true };
}

/** DTO 中 JD 长度的静态约束 */
export const JD_LENGTH_CONSTRAINT = { minimum: 150, maximum: MAX_LENGTH };
