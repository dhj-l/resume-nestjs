import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from 'openai/resources/chat/completions';
import {
  createMimoClient,
  raceWithDeadline,
  resolvePositiveInt,
  wrapMimoError,
} from './mimo.utils';

/** 待识别音频：字节与 MIME 类型 */
export interface SttAudio {
  buffer: Buffer;
  mimeType: string;
}

/** transcribeStream 的可选控制项 */
export interface SttStreamOptions {
  /**
   * 外部中止信号：SSE 调用方在 await 建连之前注册断连监听时传入，
   * 建连窗口期断开也能立即中止上游，不留空窗
   */
  signal?: AbortSignal;
}

/**
 * 流式语音识别句柄
 *
 * 打开句柄即代表上游请求已建立；iterator 逐段产出识别文本增量，
 * 拼接全部增量即完整转写结果。
 */
export interface SttStream {
  /** 逐段产出识别文本增量（可能包含标点，按上游返回原样透出） */
  iterator: AsyncGenerator<string, void, unknown>;
  /** 终止上游请求（客户端断开时调用，同步生效） */
  abort: () => void;
}

/**
 * 默认 ASR 模型：mimo-v2.5-asr（与 TTS 同一 OpenAI 兼容接口、同一 API Key）。
 *
 * 实测契约（scripts/verify-mimo-asr-stream.ts，2026-09）：
 * - 文本增量位于 choices[0].delta.content，终帧 [DONE]；
 * - asr_options 直接放入 body 可被上游接受（openai SDK 透传）。
 */
const DEFAULT_ASR_MODEL = 'mimo-v2.5-asr';
const DEFAULT_ASR_LANGUAGE = 'auto';
/**
 * 上传音频大小上限（字节），默认 20MB。
 * 整段转写与句子级分片都远低于该值，主要防滥用。属业务上限，
 * 可通过 MIMO_ASR_MAX_BYTES 调整（有效区间为不超过 STT_UPLOAD_GUARD_BYTES）。
 */
export const STT_MAX_AUDIO_BYTES = 20 * 1024 * 1024;
/**
 * STT 上传路由的 multer 硬上限（字节），纯内存防滥用护栏。
 *
 * 与业务上限（MIMO_ASR_MAX_BYTES）职责解耦：护栏只保证单个请求最多
 * 缓冲该体积，业务上限由 SttService 按环境变量独立校验，两处不再需要
 * 注释维护同步；业务上限在护栏区间内调大无需改代码。
 */
export const STT_UPLOAD_GUARD_BYTES = 50 * 1024 * 1024;
/**
 * STT 建连/请求超时（毫秒）。相比 TTS，识别含上传耗时，放宽到 60s。
 */
const STT_TIMEOUT_MS = 60000;
/**
 * 流式识别空转超时（毫秒）。
 *
 * OpenAI SDK 对 stream:true 响应跳过 timeout 竞速（client.js
 * parseResponseWithTimeout），建连后的流式体不受 STT_TIMEOUT_MS 保护；
 * 若 MiMo 中途停发数据，消费循环会永久挂起。此处以「连续该时长无新
 * 数据」兜底：正常流不受影响（计时随每块重置），停发流 60s 内以
 * 502 结束而非挂起。
 */
const STT_STREAM_IDLE_TIMEOUT_MS = 60_000;

/** 允许的音频 MIME 白名单（浏览器 MediaRecorder / 分片 WAV 常见类型） */
const ALLOWED_MIME_TYPES: ReadonlySet<string> = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/vnd.wave',
  'audio/webm',
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/m4a',
  // Safari 等浏览器录制的 m4a 常见变体（错误提示与文档均承诺支持 m4a）
  'audio/x-m4a',
  'audio/ogg',
  'audio/flac',
]);

/**
 * 语音识别服务（小米 MiMo ASR，OpenAI 兼容接口）
 *
 * 文档：https://mimo.mi.com/docs/zh-CN/api/audio/Speech-Recognition
 * 待识别音频以 input_audio（data URL + base64）放在 user 消息中，
 * asr_options 指定识别语言等参数。`transcribeStream` 以 stream: true 调用上游，
 * 逐段产出识别文本增量；契约以 scripts/verify-mimo-asr-stream.ts 实测为准。
 */
@Injectable()
export class SttService {
  private readonly logger = new Logger(SttService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * 流式识别音频，逐段产出识别文本增量
   * @param audio 待识别音频（字节 + MIME 类型）
   * @param options 可选控制项（外部中止信号）
   * @throws BadRequestException 音频非法或上游未返回识别文本
   * @throws BadGatewayException / InternalServerErrorException 上游调用失败
   */
  async transcribeStream(
    audio: SttAudio,
    options?: SttStreamOptions,
  ): Promise<SttStream> {
    const dataUrl = this.buildAudioDataUrl(audio);
    const controller = new AbortController();
    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener('abort', () => controller.abort(), {
          once: true,
        });
      }
    }

    let stream: Stream<ChatCompletionChunk>;
    try {
      // input_audio / asr_options 是 MiMo 自有扩展，openai SDK 类型未覆盖，
      // 请求体整体 cast 后透传（asr_options 透传已由 verify 脚本实测确认）
      const body = {
        model: this.config.get('MIMO_ASR_MODEL', DEFAULT_ASR_MODEL),
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'input_audio',
                input_audio: { data: dataUrl },
              },
            ],
          },
        ],
        asr_options: { language: this.resolveLanguage() },
        stream: true,
      } as unknown as ChatCompletionCreateParamsStreaming;
      stream = await this.getClient().chat.completions.create(body, {
        signal: controller.signal,
      });
    } catch (error) {
      throw this.wrapSttError(error);
    }

    return {
      iterator: this.iterateTextChunks(stream, controller),
      abort: () => controller.abort(),
    };
  }

  /** 校验并构造 input_audio 的 data URL，非法输入抛 400 */
  private buildAudioDataUrl(audio: SttAudio): string {
    const mimeType = this.normalizeMimeType(audio?.mimeType);
    if (!mimeType) {
      throw new BadRequestException(
        `不支持的音频格式：${audio?.mimeType ?? '未知'}，允许：wav、webm、mp3、mp4/m4a、ogg、flac`,
      );
    }
    if (!audio.buffer?.length) {
      throw new BadRequestException('识别音频不能为空');
    }
    const maxBytes = this.resolveMaxAudioBytes();
    if (audio.buffer.length > maxBytes) {
      throw new BadRequestException(
        `识别音频过大：${(audio.buffer.length / 1024 / 1024).toFixed(1)}MB，上限 ${(maxBytes / 1024 / 1024).toFixed(0)}MB`,
      );
    }
    return `data:${mimeType};base64,${audio.buffer.toString('base64')}`;
  }

  /** 归一化 MIME：剥离 codecs 后缀并匹配白名单，不匹配返回 null */
  private normalizeMimeType(raw: string | undefined): string | null {
    const mime = raw?.split(';')[0]?.trim().toLowerCase();
    if (!mime) return null;
    return ALLOWED_MIME_TYPES.has(mime) ? mime : null;
  }

  /**
   * 逐块解析上游 SSE chunk，产出识别文本增量
   *
   * 兼容多种形态，实测主路径为 choices[0].delta.content
   * （scripts/verify-mimo-asr-stream.ts，2026-09）。
   *
   * 每次上游读取受 STT_STREAM_IDLE_TIMEOUT_MS 空转 deadline 约束：
   * 上游中途停发数据时以 BadGatewayException 结束，而非永久挂起。
   */
  private async *iterateTextChunks(
    stream: Stream<ChatCompletionChunk>,
    controller: AbortController,
  ): AsyncGenerator<string, void, unknown> {
    let gotText = false;
    const iterator = stream[Symbol.asyncIterator]();
    let timedOut = false;
    try {
      while (true) {
        const result = await raceWithDeadline(
          iterator.next(),
          STT_STREAM_IDLE_TIMEOUT_MS,
          {
            onTimeout: () => {
              timedOut = true;
              controller.abort();
            },
            message: '语音识别响应超时：上游长时间未返回新数据',
          },
        );
        if (result.done) {
          break;
        }
        if (controller.signal.aborted) {
          return; // 客户端断开，静默终止
        }
        const chunk = result.value;
        const text = this.extractTextPayload(chunk);
        if (text) {
          gotText = true;
          yield text;
        }
        // 部分实现在流内以 error 字段报错（而非 HTTP 错误码）
        const inStreamError = (chunk as any)?.error;
        if (inStreamError) {
          throw new BadGatewayException(
            `语音识别失败：${inStreamError.message || '远端流异常'}`,
          );
        }
      }
    } catch (error) {
      if (timedOut) {
        throw error; // 已是业务超时异常，直接传播
      }
      if (controller.signal.aborted) {
        return; // 中止引起的异常属预期，不向调用方传播
      }
      throw this.wrapSttError(error);
    }
    if (!gotText) {
      throw new BadRequestException('语音识别失败：响应中没有文本数据');
    }
  }

  /** 从单个 chunk 中提取文本增量（单点归一化） */
  private extractTextPayload(chunk: ChatCompletionChunk): string | null {
    const anyChunk = chunk as any;
    const choice = anyChunk?.choices?.[0];
    const candidates: unknown[] = [
      choice?.delta?.content,
      choice?.message?.content,
      choice?.delta?.text,
      choice?.message?.text,
      anyChunk?.delta?.content,
      anyChunk?.text,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    return null;
  }

  /** 将 openai SDK 错误转换为可读的业务异常 */
  private wrapSttError(error: unknown): unknown {
    return wrapMimoError(error, { label: 'STT', scenario: '语音识别' });
  }

  /** 识别语言：auto 表示自动检测 */
  private resolveLanguage(): string {
    const language = this.config
      .get<string>('MIMO_ASR_LANGUAGE', DEFAULT_ASR_LANGUAGE)
      ?.trim();
    return language || DEFAULT_ASR_LANGUAGE;
  }

  /** 音频大小上限：环境变量优先，非法值回退默认 */
  private resolveMaxAudioBytes(): number {
    return resolvePositiveInt(
      this.config,
      'MIMO_ASR_MAX_BYTES',
      STT_MAX_AUDIO_BYTES,
    );
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = createMimoClient(this.config, STT_TIMEOUT_MS);
    }
    return this.client;
  }
}
