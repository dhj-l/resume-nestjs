import { z } from 'zod';

/** 反问建议主题标签字数上限 */
export const REVERSE_SUGGESTION_TITLE_MAX = 30;
/** 反问建议话术字数上限 */
export const REVERSE_SUGGESTION_CONTENT_MAX = 200;
/** 反问建议理由字数上限 */
export const REVERSE_SUGGESTION_RATIONALE_MAX = 150;
/** 反问建议条数下限 */
export const REVERSE_SUGGESTIONS_MIN = 3;
/** 反问建议条数上限 */
export const REVERSE_SUGGESTIONS_MAX = 5;

/**
 * 反问环节推荐建议的输出 schema
 *
 * 根据面试轮次、面试官角色、JD 与已聊内容，
 * 推荐适合当前环节的反问策略与可直接使用的话术。
 */
export const InterviewReverseSuggestionsSchema = z
  .object({
    suggestions: z
      .array(
        z.object({
          title: z.string().min(1).max(REVERSE_SUGGESTION_TITLE_MAX),
          content: z.string().min(1).max(REVERSE_SUGGESTION_CONTENT_MAX),
          rationale: z
            .string()
            .max(REVERSE_SUGGESTION_RATIONALE_MAX)
            .optional(),
        }),
      )
      .min(REVERSE_SUGGESTIONS_MIN)
      .max(REVERSE_SUGGESTIONS_MAX),
  })
  .passthrough();

export type InterviewReverseSuggestion = z.infer<
  typeof InterviewReverseSuggestionsSchema
>['suggestions'][number];
