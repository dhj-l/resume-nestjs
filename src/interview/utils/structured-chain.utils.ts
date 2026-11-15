import { PromptTemplate } from '@langchain/core/prompts';
import type { Runnable } from '@langchain/core/runnables';
import type { ZodSchema } from 'zod';
import type { AiService } from 'src/ai/ai.service';
import {
  AI_INVOKE_RETRIES,
  invokeChainWithRetry,
} from 'src/ai/chain-invoke.utils';
import { ANALYSIS_TIMEOUT_MS } from 'src/resume-ai/analysis.utils';

export interface StructuredChainParams {
  /** 提示词模板（变量占位符与 variables 一一对应） */
  promptTemplate: string;
  /** 模型 Runnable（如 aiService.generateInterviewQuestion()） */
  llm: Runnable;
  /** 输出结构的 Zod schema */
  schema: ZodSchema;
  /** 注入模板的变量（全部为字符串） */
  variables: Record<string, string>;
  /** 日志与超时文案中的动作名，如 '大纲生成'、'报告生成' */
  label: string;
  /** 单次尝试超时（毫秒），默认 ANALYSIS_TIMEOUT_MS */
  timeoutMs?: number;
  /** 失败重试次数（不含首次），默认 AI_INVOKE_RETRIES */
  retries?: number;
  /** 结果结构校验：抛错视为本次尝试失败并进入重试 */
  validate: (result: unknown) => void;
}

/**
 * 构造并调用「提示词模板 → 模型 → 结构化解析」的标准链。
 *
 * interview 出题引擎与评价报告共用同一套链式脚手架与超时重试策略，
 * 避免副本间行为分叉。
 */
export async function invokeStructuredChain<T>(
  aiService: AiService,
  params: StructuredChainParams,
): Promise<T> {
  const chain = PromptTemplate.fromTemplate(params.promptTemplate)
    .pipe(params.llm)
    .pipe(aiService.createRobustStructuredParser(params.schema));
  return invokeChainWithRetry<T>(chain, params.variables, {
    timeoutMs: params.timeoutMs ?? ANALYSIS_TIMEOUT_MS,
    retries: params.retries ?? AI_INVOKE_RETRIES,
    label: params.label,
    validate: params.validate,
  });
}
