import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Stream } from 'openai/streaming';
import { ChatCompletionChunk } from 'openai/resources/chat/completions';
import { TTS_STYLE } from './prompt/tts';
import {
  createMimoClient,
  raceWithDeadline,
  resolvePositiveInt,
  wrapMimoError,
} from './mimo.utils';

/** 语音合成结果：wav 音频字节与对应 MIME 类型 */
export interface TtsAudio {
  buffer: Buffer;
  mimeType: string;
}

/** 流式 PCM 的音频元信息 */
export interface TtsStreamMeta {
  /** 采样率（Hz），由 MIMO_TTS_SAMPLE_RATE 配置或默认值提供 */
  sampleRate: number;
  /** 声道数 */
  channels: number;
}

/**
 * 流式语音合成句柄
 *
 * 打开句柄即代表上游请求已建立；iterator 逐块产出解码后的 PCM16 原始字节，
 * 调用方（接收端）可选择边收边播，也可聚合后封装为 wav 完整文件。
 */
export interface TtsStream {
  meta: TtsStreamMeta;
  /** 逐块产出解码后的 PCM16 原始字节（小端，16bit，单声道） */
  iterator: AsyncGenerator<Buffer, void, unknown>;
  /** 终止上游请求（客户端断开时调用，同步生效） */
  abort: () => void;
}

/**
 * 默认 TTS 模型：预置音色版（mimo-v2.5-tts）。
 *
 * ⚠️ 不要改回 mimo-v2.5-tts-voicedesign：该模型不支持 pcm16 + stream:true，
 * 会返回 400 Param Incorrect。已由 scripts/verify-mimo-tts-stream.ts 实测确认
 * mimo-v2.5-tts + pcm16 + stream 正常（24000Hz / 单声道 / 16bit）。
 */
const DEFAULT_TTS_MODEL = 'mimo-v2.5-tts';
const DEFAULT_TTS_VOICE = '冰糖';
const DEFAULT_TTS_STYLE = TTS_STYLE;
/**
 * 单次合成文本长度上限（面试题 ≤400 字，留余量防滥用）
 */
const MAX_TEXT_LENGTH = 1000;
/**
 * TTS 请求超时（毫秒）
 */
const TTS_TIMEOUT_MS = 30000;
/**
 * 流式合成整体时长上限（毫秒）。
 *
 * OpenAI SDK 对 stream:true 响应跳过 timeout 竞态（client.js parseResponseWithTimeout），
 * 上游建连后的流式体不受 TTS_TIMEOUT_MS 保护；若 MiMo 中途停发数据，
 * 消费循环会永久挂起。此处以整体 deadline 兜底：1000 字上限文本
 * 约需 4 分钟音频流，10 分钟足够宽裕。
 */
const TTS_STREAM_TOTAL_TIMEOUT_MS = 10 * 60 * 1000;
/**
 * PCM16 采样率默认值（Hz）。
 *
 * ⚠️ 以实测为准：用 scripts/verify-mimo-tts-stream.ts 连一次真实接口，
 * 解析非流式 wav 头或按字节时长换算后，如有出入仅需修改此处默认值
 * （或通过环境变量 MIMO_TTS_SAMPLE_RATE 覆盖，无需改代码）。
 */
const DEFAULT_TTS_SAMPLE_RATE = 24000;
/**
 * 声道数：MiMo TTS 输出单声道 PCM（interview 模块缓存重放时共用）
 */
export const TTS_PCM_CHANNELS = 1;

/**
 * 将原始 PCM16（小端 16bit）封装为标准 WAV（RIFF/PCM）文件字节。
 * 供 TtsService 与 interview 模块（缓存命中重放）共用，保证封装逻辑单点。
 */
export function pcm16ToWav(pcm: Buffer, meta: TtsStreamMeta): Buffer {
  const channels = meta.channels;
  const bitsPerSample = 16;
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = meta.sampleRate * blockAlign;

  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16); // fmt 块长度
  header.writeUInt16LE(1, 20); // audioFormat：1 = PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(meta.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/**
 * 语音合成服务（小米 MiMo TTS，OpenAI 兼容接口）
 *
 * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
 * 待合成文本放在 role=assistant 消息中，风格指令放在 role=user 消息中（可选），
 * audio 参数指定音色与格式。`synthesizeStream` 以 stream: true + pcm16 调用上游，
 * 逐块产出解码后的 PCM16 字节；`synthesize` 基于流式路径聚合后本地封装 wav，
 * 对外行为与旧的非流式调用保持一致。
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * 将文本合成为 wav 音频（内部走流式通路，聚合后封装 WAV）
   * @param text 待合成的纯文本
   * @throws BadRequestException 文本非法或 TTS 远端调用失败
   */
  async synthesize(text: string): Promise<TtsAudio> {
    const handle = await this.synthesizeStream(text);
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of handle.iterator) {
        chunks.push(chunk);
      }
    } catch (error) {
      throw this.wrapTtsError(error);
    }
    return {
      buffer: pcm16ToWav(Buffer.concat(chunks), handle.meta),
      mimeType: 'audio/wav',
    };
  }

  /**
   * 以流式方式合成文本，逐块产出 PCM16 原始字节
   * @param text 待合成的纯文本
   * @throws BadRequestException 文本非法
   * @throws BadGatewayException / InternalServerErrorException 上游调用失败
   */
  async synthesizeStream(text: string): Promise<TtsStream> {
    const trimmed = text?.trim();
    if (!trimmed) {
      throw new BadRequestException('TTS 合成文本不能为空');
    }
    if (trimmed.length > MAX_TEXT_LENGTH) {
      throw new BadRequestException(
        `TTS 合成文本过长：${trimmed.length} 字符，上限 ${MAX_TEXT_LENGTH}`,
      );
    }

    const style = this.resolveStyle();
    const controller = new AbortController();
    const meta: TtsStreamMeta = {
      sampleRate: this.resolveSampleRate(),
      channels: TTS_PCM_CHANNELS,
    };

    let stream: Stream<ChatCompletionChunk>;
    try {
      stream = await this.getClient().chat.completions.create(
        {
          model: this.config.get('MIMO_TTS_MODEL', DEFAULT_TTS_MODEL),
          messages: [
            ...(style ? [{ role: 'user' as const, content: style }] : []),
            { role: 'assistant' as const, content: trimmed },
          ],
          audio: {
            format: 'pcm16',
            voice: this.config.get('MIMO_TTS_VOICE', DEFAULT_TTS_VOICE),
          },
          stream: true,
        },
        { signal: controller.signal },
      );
    } catch (error) {
      throw this.wrapTtsError(error);
    }

    return {
      meta,
      iterator: this.iterateAudioChunks(stream, controller),
      abort: () => controller.abort(),
    };
  }

  /**
   * 逐块解析上游 SSE chunk，产出解码后的 PCM16 字节
   *
   * 兼容两种已知形态：`choices[0].delta.audio.data`（OpenAI 音频流式范式）
   * 与 `choices[0].message.audio.data`（与服务非流式响应对齐）。
   * 用 scripts/verify-mimo-tts-stream.ts 实测后如需调整，仅改 extractAudioPayload。
   *
   * 整个消费过程受 TTS_STREAM_TOTAL_TIMEOUT_MS 整体 deadline 约束：
   * 上游中途停发数据时以 BadGatewayException 结束，而非永久挂起。
   */
  private async *iterateAudioChunks(
    stream: Stream<ChatCompletionChunk>,
    controller: AbortController,
  ): AsyncGenerator<Buffer, void, unknown> {
    let gotAudio = false;
    const deadline = Date.now() + TTS_STREAM_TOTAL_TIMEOUT_MS;
    const iterator = stream[Symbol.asyncIterator]();
    let timedOut = false;
    try {
      while (true) {
        const result = await raceWithDeadline(
          iterator.next(),
          deadline - Date.now(),
          {
            onTimeout: () => {
              timedOut = true;
              controller.abort();
            },
            message: '语音合成响应超时，请稍后重试',
          },
        );
        if (result.done) {
          break;
        }
        if (controller.signal.aborted) {
          return; // 客户端断开，静默终止
        }
        const base64 = this.extractAudioPayload(result.value);
        if (base64) {
          gotAudio = true;
          yield Buffer.from(base64, 'base64');
          continue;
        }
        // 部分实现在流内以 error 字段报错（而非 HTTP 错误码）
        const inStreamError = (result.value as any)?.error;
        if (inStreamError) {
          throw new BadGatewayException(
            `语音合成失败：${inStreamError.message || '远端流异常'}`,
          );
        }
      }
    } catch (error) {
      if (timedOut) {
        throw error;
      }
      if (controller.signal.aborted) {
        return; // 中止引起的异常属预期，不向调用方传播
      }
      throw this.wrapTtsError(error);
    }
    if (!gotAudio) {
      throw new BadRequestException('语音合成失败：响应中没有音频数据');
    }
  }

  /**
   * 从单个 chunk 中提取音频 base64 载荷（单点归一化）
   */
  private extractAudioPayload(chunk: ChatCompletionChunk): string | null {
    const anyChunk = chunk as any;
    const choice = anyChunk?.choices?.[0];
    const candidates: unknown[] = [
      choice?.delta?.audio?.data,
      choice?.message?.audio?.data,
      anyChunk?.delta?.audio?.data,
      anyChunk?.message?.audio?.data,
      anyChunk?.audio?.data,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.length > 0) {
        return candidate;
      }
    }
    return null;
  }

  /** 将 openai SDK 错误转换为可读的业务异常 */
  private wrapTtsError(error: unknown): unknown {
    return wrapMimoError(error, { label: 'TTS', scenario: '语音合成' });
  }

  /** 风格指令：默认面试官语气，配置为空字符串时不传风格消息 */
  private resolveStyle(): string | null {
    const style = this.config
      .get<string>('MIMO_TTS_STYLE', DEFAULT_TTS_STYLE)
      ?.trim();
    return style || null;
  }

  /** PCM16 采样率：环境变量优先，非法值回退默认 */
  private resolveSampleRate(): number {
    return resolvePositiveInt(
      this.config,
      'MIMO_TTS_SAMPLE_RATE',
      DEFAULT_TTS_SAMPLE_RATE,
    );
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = createMimoClient(this.config, TTS_TIMEOUT_MS);
    }
    return this.client;
  }
}
