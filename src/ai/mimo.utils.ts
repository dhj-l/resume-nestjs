import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError } from 'openai';

const logger = new Logger('MimoVoice');

/** MiMo 开放平台 OpenAI 兼容接口的默认地址 */
export const MIMO_DEFAULT_BASE_URL = 'https://api.xiaomimimo.com/v1';

/**
 * 创建 MiMo（OpenAI 兼容）客户端
 *
 * @param config    配置来源（MIMO_API_KEY 必填，MIMO_BASE_URL 可覆盖默认地址）
 * @param timeoutMs 建连/请求超时；注意 OpenAI SDK 对 stream:true 响应
 *                  跳过 timeout 竞速，流式消费需自行加 deadline（见 raceWithDeadline）
 */
export function createMimoClient(
  config: ConfigService,
  timeoutMs: number,
): OpenAI {
  return new OpenAI({
    apiKey: config.getOrThrow<string>('MIMO_API_KEY'),
    baseURL: config.get<string>('MIMO_BASE_URL', MIMO_DEFAULT_BASE_URL),
    timeout: timeoutMs,
    maxRetries: 1,
  });
}

export interface MimoErrorContext {
  /** 日志前缀，如 'TTS'、'STT' */
  label: string;
  /** 用户可读场景名，如 '语音合成'、'语音识别' */
  scenario: string;
}

/**
 * 将 openai SDK 错误转换为可读的业务异常
 *
 * 余额不足/鉴权失败/限流等属于远端账户问题，给出可操作的提示；
 * 这些都是上游服务失败，用 502 而非 400 避免误导客户端。
 */
export function wrapMimoError(
  error: unknown,
  context: MimoErrorContext,
): unknown {
  if (
    error instanceof BadRequestException ||
    error instanceof BadGatewayException ||
    error instanceof InternalServerErrorException
  ) {
    return error;
  }
  if (error instanceof APIError) {
    logger.error(
      `${context.label} 调用失败：${error.status} ${error.message}`,
      error.stack,
    );
    if (error.status === 402) {
      return new BadGatewayException('语音服务账户余额不足，请联系管理员充值');
    }
    if (error.status === 401) {
      return new BadGatewayException(
        '语音服务未授权，请检查 MIMO_API_KEY 配置',
      );
    }
    if (error.status === 429) {
      return new BadGatewayException('语音服务请求过于频繁，请稍后重试');
    }
    return new BadGatewayException(
      `${context.scenario}失败：${error.message || '远端服务异常'}`,
    );
  }
  // 其余异常（MIMO_API_KEY 未配置、网络异常等）属于服务端问题
  logger.error(
    `${context.label} 调用异常：${(error as Error)?.message ?? error}`,
    (error as Error)?.stack,
  );
  return new InternalServerErrorException(
    `${context.scenario}失败，请稍后重试`,
  );
}

export interface DeadlineRaceOptions {
  /** 到点触发的副作用（通常为中止上游请求） */
  onTimeout?: () => void;
  /** 超时异常文案 */
  message: string;
}

/**
 * 以 deadline 约束单次上游读取：到点触发 onTimeout（通常中止上游）
 * 并以业务超时错误结束等待，避免上游停发数据时消费循环永久挂起
 */
export function raceWithDeadline<T>(
  promise: Promise<T>,
  remainingMs: number,
  options: DeadlineRaceOptions,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => {
        options.onTimeout?.();
        reject(new BadGatewayException(options.message));
      },
      Math.max(remainingMs, 0),
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * 读取正整数配置：环境变量优先，非法值回退默认并记 warn
 */
export function resolvePositiveInt(
  config: ConfigService,
  key: string,
  fallback: number,
): number {
  const raw = config.get<string>(key);
  const value = raw ? parseInt(raw, 10) : fallback;
  if (!Number.isFinite(value) || value <= 0) {
    logger.warn(`${key} 非法（${raw}），回退 ${fallback}`);
    return fallback;
  }
  return value;
}
