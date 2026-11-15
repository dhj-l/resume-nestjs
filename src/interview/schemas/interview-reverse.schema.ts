import { z } from 'zod';

/** 面试官反问回应字数上限 */
export const REVERSE_RESPONSE_MAX = 600;

/**
 * 反问环节面试官回应的输出 schema
 *
 * 候选人每次反问后，AI 以面试官人设真实回应，并判断是否继续反问：
 * - continueReverse=false：候选人明说没有问题、反问明显敷衍或已达上限
 */
export const InterviewReverseResponseSchema = z
  .object({
    response: z.string().min(1).max(REVERSE_RESPONSE_MAX),
    continueReverse: z.boolean(),
    reason: z.string().max(200).optional(),
  })
  .passthrough();

export type InterviewReverseResponse = z.infer<
  typeof InterviewReverseResponseSchema
>;
