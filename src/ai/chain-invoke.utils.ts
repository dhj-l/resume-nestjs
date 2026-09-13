import { Logger } from '@nestjs/common';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import type { LLMResult } from '@langchain/core/outputs';

const logger = new Logger('AiChainInvoke');

/** AI 调用失败重试次数（不含首次）——出题/大纲/报告统一使用 */
export const AI_INVOKE_RETRIES = 2;

/**
 * 记录 DeepSeek 前缀缓存命中 token 数，用于验证提示词
 * 「稳定在前、易变在后」排列的缓存效果（命中率取决于请求输入前缀的
 * 逐字一致性）。LangChain 版本间字段位置有差异：优先取原生 usage 的
 * prompt_cache_hit_tokens / prompt_cache_miss_tokens，回退到标准化的
 * usage_metadata.input_token_details.cache_read；取不到时静默跳过。
 */
class PromptCacheMetricsHandler extends BaseCallbackHandler {
  name = 'PromptCacheMetricsHandler';

  handleLLMEnd(output: LLMResult): void {
    try {
      // Generation 基类未声明 message（聊天模型实际返回 ChatGeneration），
      // 这里只消费 usage 相关字段，按形状断言即可
      const message = (
        output.generations?.[0]?.[0] as
          | {
              message?: {
                additional_kwargs?: { usage?: Record<string, unknown> };
                usage_metadata?: {
                  input_tokens?: number;
                  input_token_details?: { cache_read?: number };
                };
              };
            }
          | undefined
      )?.message;
      const nativeUsage = message?.additional_kwargs?.usage as
        | {
            prompt_tokens?: number;
            prompt_cache_hit_tokens?: number;
            prompt_cache_miss_tokens?: number;
          }
        | undefined;
      const inputTokens =
        typeof nativeUsage?.prompt_tokens === 'number'
          ? nativeUsage.prompt_tokens
          : message?.usage_metadata?.input_tokens;
      if (typeof inputTokens !== 'number') {
        return;
      }
      const hitTokens =
        typeof nativeUsage?.prompt_cache_hit_tokens === 'number'
          ? nativeUsage.prompt_cache_hit_tokens
          : (message?.usage_metadata?.input_token_details?.cache_read ?? 0);
      const missTokens =
        typeof nativeUsage?.prompt_cache_miss_tokens === 'number'
          ? nativeUsage.prompt_cache_miss_tokens
          : undefined;
      logger.log(
        `prompt 缓存命中 ${hitTokens} / 输入 ${inputTokens} token` +
          (missTokens !== undefined ? `（未命中 ${missTokens}）` : ''),
      );
    } catch {
      // 埋点失败不影响主流程
    }
  }
}

const promptCacheMetricsHandler = new PromptCacheMetricsHandler();

export interface ChainInvokeOptions {
  /** 单次尝试超时（毫秒），超时后以 AbortController 中止链调用 */
  timeoutMs: number;
  /** 失败重试次数（不含首次） */
  retries: number;
  /** 日志与超时文案中的动作名，如 '大纲生成'、'报告生成' */
  label: string;
  /** 结果结构校验：抛错视为本次尝试失败并进入重试 */
  validate?: (result: unknown) => void;
}

/**
 * LangChain 链调用的统一脚手架：单次超时 + 失败重试。
 *
 * interview 出题/大纲/报告等 AI 编排共用，保证重试与超时行为单点；
 * 中止引起的错误统一包装为「{label}超时」，其余错误保留原始信息。
 * 每次模型调用结束时记录 DeepSeek 前缀缓存命中 token 数（PromptCacheMetricsHandler）。
 */
export async function invokeChainWithRetry<T>(
  chain: { invoke: (input: any, options?: any) => Promise<unknown> },
  input: Record<string, unknown>,
  options: ChainInvokeOptions,
): Promise<T> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= options.retries; attempt++) {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    // 与链调用竞速：即使链内部不响应中止信号，到点也强制失败进入重试
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(new Error(`${options.label}超时`));
      }, options.timeoutMs);
    });
    try {
      const result = await Promise.race([
        chain.invoke(input, {
          signal: controller.signal,
          callbacks: [promptCacheMetricsHandler],
        }),
        timeoutPromise,
      ]);
      options.validate?.(result);
      return result as T;
    } catch (error: any) {
      const attemptError = controller.signal.aborted
        ? new Error(`${options.label}超时`)
        : error instanceof Error
          ? error
          : new Error(String(error));
      lastError = attemptError;
      logger.warn(
        `${options.label}第 ${attempt + 1} 次尝试失败：${attemptError.message}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError ?? new Error(`${options.label}失败`);
}
