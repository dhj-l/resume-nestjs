import { Logger } from '@nestjs/common';

const logger = new Logger('AiChainInvoke');

/** AI 调用失败重试次数（不含首次）——出题/大纲/报告统一使用 */
export const AI_INVOKE_RETRIES = 2;

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
        chain.invoke(input, { signal: controller.signal }),
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
