import {
  JD_KEYWORD_GROUPS,
  JD_REQUIRED_KEYWORD_COUNT,
  MAX_LENGTH,
  VALIDATION_MESSAGES,
  getEffectiveMinLength,
  hasDiscriminatoryContent,
  hasEnoughParagraphs,
  matchKeywordGroup,
} from 'src/resume-ai/constants/job-validation.constants';

/**
 * 校验岗位 JD 是否可用于模拟面试（与简历分析共用校验规则）
 *
 * 复用 resume-ai 的 JD 校验常量与关键词/违禁词匹配逻辑，
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

  if (length < getEffectiveMinLength(jobDescription)) {
    return { isValid: false, reason: messages.tooShort };
  }

  if (!hasEnoughParagraphs(jobDescription)) {
    return { isValid: false, reason: messages.insufficientParagraphs };
  }

  let matchedGroups = 0;
  for (const group of JD_KEYWORD_GROUPS) {
    if (matchKeywordGroup(jobDescription, group)) {
      matchedGroups++;
    }
  }
  if (matchedGroups < JD_REQUIRED_KEYWORD_COUNT) {
    return { isValid: false, reason: messages.missingKeywords };
  }

  if (hasDiscriminatoryContent(jobDescription)) {
    return { isValid: false, reason: messages.discriminatoryContent };
  }

  return { isValid: true };
}

/** DTO 中 JD 长度的静态约束 */
export const JD_LENGTH_CONSTRAINT = { minimum: 150, maximum: MAX_LENGTH };
