import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError } from 'openai';

/** 语音合成结果：wav 音频字节与对应 MIME 类型 */
export interface TtsAudio {
  buffer: Buffer;
  mimeType: string;
}

const DEFAULT_TTS_MODEL = 'mimo-v2.5-tts-voicedesign';
const DEFAULT_TTS_VOICE = '冰糖';
const DEFAULT_TTS_BASE_URL = 'https://api.xiaomimimo.com/v1';
const DEFAULT_TTS_STYLE =
  '请用专业、沉稳、清晰的面试官语气朗读，语速适中，自然连贯。';
/** 单次合成文本长度上限（面试题 ≤400 字，留余量防滥用） */
const MAX_TEXT_LENGTH = 1000;
/** TTS 请求超时（毫秒） */
const TTS_TIMEOUT_MS = 30000;

/**
 * 语音合成服务（小米 MiMo TTS，OpenAI 兼容接口）
 *
 * 文档：https://mimo.mi.com/docs/zh-CN/quick-start/usage-guide/audio/speech-synthesis-v2.5
 * 待合成文本放在 role=assistant 消息中，风格指令放在 role=user 消息中（可选），
 * audio 参数指定音色与格式，响应 message.audio.data 为 base64 编码的音频字节。
 */
@Injectable()
export class TtsService {
  private readonly logger = new Logger(TtsService.name);
  private client: OpenAI | null = null;

  constructor(private readonly config: ConfigService) {}

  /**
   * 将文本合成为 wav 音频
   * @param text 待合成的纯文本
   * @throws BadRequestException 文本非法或 TTS 远端调用失败
   */
  async synthesize(text: string): Promise<TtsAudio> {
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
    try {
      const completion = await this.getClient().chat.completions.create({
        model: this.config.get('MIMO_TTS_MODEL', DEFAULT_TTS_MODEL),
        messages: [
          ...(style ? [{ role: 'user' as const, content: style }] : []),
          { role: 'assistant' as const, content: trimmed },
        ],
        audio: {
          format: 'wav',
          voice: this.config.get('MIMO_TTS_VOICE', DEFAULT_TTS_VOICE),
        },
      });

      const base64Audio = completion.choices?.[0]?.message?.audio?.data;
      if (!base64Audio) {
        this.logger.error('TTS 响应缺少音频数据');
        throw new BadRequestException('语音合成失败：响应中没有音频数据');
      }

      return {
        buffer: Buffer.from(base64Audio, 'base64'),
        mimeType: 'audio/wav',
      };
    } catch (error) {
      throw this.wrapTtsError(error);
    }
  }

  /** 将 openai SDK 错误转换为可读的业务异常 */
  private wrapTtsError(error: unknown): unknown {
    if (error instanceof BadRequestException) {
      return error;
    }
    if (error instanceof APIError) {
      // 余额不足/鉴权失败/限流等属于远端账户问题，给出可操作的提示；
      // 这些都是上游服务失败，用 502 而非 400 避免误导客户端
      this.logger.error(
        `TTS 调用失败：${error.status} ${error.message}`,
        error.stack,
      );
      if (error.status === 402) {
        return new BadGatewayException(
          '语音服务账户余额不足，请联系管理员充值',
        );
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
        `语音合成失败：${error.message || '远端服务异常'}`,
      );
    }
    // 其余异常（MIMO_API_KEY 未配置、网络异常等）属于服务端问题
    this.logger.error(
      `TTS 调用异常：${(error as Error)?.message ?? error}`,
      (error as Error)?.stack,
    );
    return new InternalServerErrorException('语音合成失败，请稍后重试');
  }

  /** 风格指令：默认面试官语气，配置为空字符串时不传风格消息 */
  private resolveStyle(): string | null {
    const style = this.config
      .get<string>('MIMO_TTS_STYLE', DEFAULT_TTS_STYLE)
      ?.trim();
    return style || null;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        apiKey: this.config.getOrThrow<string>('MIMO_API_KEY'),
        baseURL: this.config.get<string>('MIMO_BASE_URL', DEFAULT_TTS_BASE_URL),
        timeout: TTS_TIMEOUT_MS,
        maxRetries: 1,
      });
    }
    return this.client;
  }
}
