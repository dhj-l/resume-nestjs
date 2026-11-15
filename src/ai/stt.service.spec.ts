import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI, { APIError } from 'openai';
import { SttService } from './stt.service';

jest.mock('openai', () => ({
  __esModule: true,
  default: jest.fn(),
  // 构造签名与真实 APIError 对齐：(status, error, message, headers)
  APIError: class APIError extends Error {
    status: number;
    constructor(status: number, error: any, message?: string) {
      super(message ?? (typeof error === 'string' ? error : error?.message));
      this.name = 'APIError';
      this.status = status;
    }
  },
}));

/** 构造一个可 for-await 的假上游流 */
function makeStream(chunks: unknown[]) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    },
  };
}

/** delta.content 形态的文本 chunk（实测主路径，见 verify-mimo-asr-stream） */
function deltaTextChunk(text: string) {
  return { choices: [{ delta: { content: text } }] };
}

/** message.content 形态的文本 chunk（兼容形态） */
function messageTextChunk(text: string) {
  return { choices: [{ message: { content: text } }] };
}

const WAV_AUDIO = {
  buffer: Buffer.from('fake-wav-bytes'),
  mimeType: 'audio/wav',
};

describe('SttService - MiMo 语音识别（流式）', () => {
  let service: SttService;

  const mockCreate = jest.fn();
  const config = {
    get: jest.fn(),
    getOrThrow: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    // 默认读取环境变量的默认值，个别用例再覆盖
    config.get.mockImplementation(
      (key: string, defaultValue?: string) => defaultValue,
    );
    config.getOrThrow.mockReturnValue('sk-mimo-test');
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create: mockCreate } },
    }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [SttService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = module.get<SttService>(SttService);
  });

  describe('transcribeStream', () => {
    it('should open the upstream with stream:true, input_audio and asr_options, and yield text deltas', async () => {
      mockCreate.mockResolvedValue(
        makeStream([deltaTextChunk('今天'), deltaTextChunk('天气不错')]),
      );

      const handle = await service.transcribeStream(WAV_AUDIO);

      const text = await collect(handle.iterator);
      expect(text).toBe('今天天气不错');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mimo-v2.5-asr',
          stream: true,
          asr_options: { language: 'auto' },
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_audio',
                  input_audio: {
                    data: `data:audio/wav;base64,${Buffer.from('fake-wav-bytes').toString('base64')}`,
                  },
                },
              ],
            },
          ],
        }),
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({
          apiKey: 'sk-mimo-test',
          baseURL: 'https://api.xiaomimimo.com/v1',
        }),
      );
    });

    it('should read model and language from configuration', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) => {
        const overrides: Record<string, string> = {
          MIMO_ASR_MODEL: 'mimo-v2.5-asr-hd',
          MIMO_ASR_LANGUAGE: 'zh',
        };
        return overrides[key] ?? defaultValue;
      });
      mockCreate.mockResolvedValue(makeStream([deltaTextChunk('你好')]));

      await service.transcribeStream(WAV_AUDIO);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mimo-v2.5-asr-hd',
          asr_options: { language: 'zh' },
        }),
        expect.anything(),
      );
    });

    it('should fall back to auto language when configured blank', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) =>
        key === 'MIMO_ASR_LANGUAGE' ? '  ' : defaultValue,
      );
      mockCreate.mockResolvedValue(makeStream([deltaTextChunk('你好')]));

      await service.transcribeStream(WAV_AUDIO);

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({ asr_options: { language: 'auto' } }),
        expect.anything(),
      );
    });

    it('should accept a browser mime type with codecs suffix', async () => {
      mockCreate.mockResolvedValue(makeStream([deltaTextChunk('你好')]));

      await service.transcribeStream({
        buffer: Buffer.from('x'),
        mimeType: 'audio/webm;codecs=opus',
      });

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: [
                expect.objectContaining({
                  input_audio: {
                    data: expect.stringContaining('data:audio/webm;base64,'),
                  },
                }),
              ],
            }),
          ],
        }),
        expect.anything(),
      );
    });

    it('should accept the audio/x-m4a variant (Safari recordings)', async () => {
      // 错误提示与文档均承诺支持 m4a：x-m4a 变体不得被白名单误拒
      mockCreate.mockResolvedValue(makeStream([deltaTextChunk('你好')]));

      await expect(
        service.transcribeStream({
          buffer: Buffer.from('x'),
          mimeType: 'audio/x-m4a',
        }),
      ).resolves.toBeDefined();
    });

    it('should reject an unsupported mime type without calling the API', async () => {
      await expect(
        service.transcribeStream({
          buffer: Buffer.from('x'),
          mimeType: 'video/mp4',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should reject empty audio without calling the API', async () => {
      await expect(
        service.transcribeStream({
          buffer: Buffer.alloc(0),
          mimeType: 'audio/wav',
        }),
      ).rejects.toThrow('不能为空');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should reject audio larger than the limit', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) =>
        key === 'MIMO_ASR_MAX_BYTES' ? '10' : defaultValue,
      );
      await expect(
        service.transcribeStream({
          buffer: Buffer.alloc(11),
          mimeType: 'audio/wav',
        }),
      ).rejects.toThrow('过大');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should fall back to the default size limit when config is invalid', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) =>
        key === 'MIMO_ASR_MAX_BYTES' ? 'abc' : defaultValue,
      );
      // 默认 20MB，1KB 音频应通过校验并触达上游
      mockCreate.mockResolvedValue(makeStream([deltaTextChunk('你好')]));

      await expect(service.transcribeStream(WAV_AUDIO)).resolves.toBeDefined();
    });

    it('should parse message.content chunks (compat shape) as well', async () => {
      mockCreate.mockResolvedValue(
        makeStream([messageTextChunk('你'), deltaTextChunk('好')]),
      );

      const handle = await service.transcribeStream(WAV_AUDIO);
      expect(await collect(handle.iterator)).toBe('你好');
    });

    it('should throw when the stream contains no text data', async () => {
      mockCreate.mockResolvedValue(
        makeStream([
          { choices: [{ delta: { audio_tokens: 3 } }] },
          { choices: [{ delta: {} }], usage: {} },
        ]),
      );

      await expect(
        service.transcribeStream(WAV_AUDIO).then((h) => collect(h.iterator)),
      ).rejects.toThrow('没有文本数据');
    });

    it('should abort silently when aborted mid-stream', async () => {
      mockCreate.mockResolvedValue(
        makeStream([deltaTextChunk('你'), deltaTextChunk('好')]),
      );

      const handle = await service.transcribeStream(WAV_AUDIO);
      const iterator = handle.iterator;
      await iterator.next(); // 消费第一段
      handle.abort();
      // 中止后迭代立即完成（而非抛错）
      await expect(iterator.next()).resolves.toEqual(
        expect.objectContaining({ done: true }),
      );
    });

    it('should abort via an external signal mid-stream', async () => {
      mockCreate.mockResolvedValue(
        makeStream([deltaTextChunk('你'), deltaTextChunk('好')]),
      );

      const external = new AbortController();
      const handle = await service.transcribeStream(WAV_AUDIO, {
        signal: external.signal,
      });
      const iterator = handle.iterator;
      await iterator.next(); // 消费第一段
      external.abort();
      // 外部信号级联到内部中止：迭代立即完成（而非抛错）
      await expect(iterator.next()).resolves.toEqual(
        expect.objectContaining({ done: true }),
      );
    });

    it('should forward an already-aborted external signal to the upstream request', async () => {
      mockCreate.mockRejectedValue(new Error('cancelled'));
      const external = new AbortController();
      external.abort();

      // 建连窗口期断开：外部信号必须在发起请求前就生效
      await expect(
        service.transcribeStream(WAV_AUDIO, { signal: external.signal }),
      ).rejects.toThrow();
      expect(mockCreate.mock.calls[0][1].signal.aborted).toBe(true);
    });

    it('should fail with a business error when the upstream stalls mid-stream', async () => {
      // OpenAI SDK 对 stream:true 跳过 timeout 竞速：上游停发数据时
      // 消费循环必须靠自身的空转 deadline 兜底，而不是永久挂起
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        mockCreate.mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield deltaTextChunk('你');
            await new Promise(() => {}); // 模拟上游中途停发数据
          },
        });

        const handle = await service.transcribeStream(WAV_AUDIO);
        const consume = (async () => {
          for await (const delta of handle.iterator) {
            void delta;
          }
        })();
        const assertion = expect(consume).rejects.toThrow(BadGatewayException);

        // 空转 deadline（60s）耗尽后应报错而非永久挂起
        await jest.advanceTimersByTimeAsync(60_000 + 1);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('should not time out a healthy stream that keeps producing chunks', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        mockCreate.mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            for (let i = 0; i < 5; i++) {
              yield deltaTextChunk('好');
            }
          },
        });

        const handle = await service.transcribeStream(WAV_AUDIO);
        const deltas: string[] = [];
        for await (const delta of handle.iterator) {
          deltas.push(delta);
        }
        expect(deltas).toHaveLength(5);
      } finally {
        jest.useRealTimers();
      }
    });

    it('should map a mid-stream APIError to a business exception', async () => {
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield deltaTextChunk('你');
          throw new APIError(429, 'Too many requests', undefined, undefined);
        },
      });

      await expect(
        service.transcribeStream(WAV_AUDIO).then((h) => collect(h.iterator)),
      ).rejects.toThrow('过于频繁');
    });

    it('should treat an in-stream error payload as a failure', async () => {
      mockCreate.mockResolvedValue(
        makeStream([
          deltaTextChunk('你'),
          { error: { message: 'audio too short' } },
        ]),
      );

      await expect(
        service.transcribeStream(WAV_AUDIO).then((h) => collect(h.iterator)),
      ).rejects.toThrow('语音识别失败');
    });
  });

  describe('remote API error handling', () => {
    it('should map 402 to a 502 balance error', async () => {
      mockCreate.mockRejectedValue(
        new APIError(402, 'Insufficient account balance', undefined, undefined),
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        '余额不足',
      );
    });

    it('should map 401 to a 502 auth error', async () => {
      mockCreate.mockRejectedValue(
        new APIError(401, 'Invalid API key', undefined, undefined),
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        '请检查 MIMO_API_KEY',
      );
    });

    it('should map 429 to a 502 rate-limit error', async () => {
      mockCreate.mockRejectedValue(
        new APIError(429, 'Too many requests', undefined, undefined),
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        '过于频繁',
      );
    });

    it('should wrap other API errors with a 502 generic message', async () => {
      mockCreate.mockRejectedValue(
        new APIError(500, 'server error', undefined, undefined),
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        '语音识别失败',
      );
    });

    it('should wrap unexpected errors as a 500 generic failure', async () => {
      mockCreate.mockRejectedValue(new Error('network down'));
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        '请稍后重试',
      );
    });

    it('should map missing MIMO_API_KEY config to 500', async () => {
      config.getOrThrow.mockImplementation(() => {
        throw new Error('MIMO_API_KEY is not configured');
      });
      await expect(service.transcribeStream(WAV_AUDIO)).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

async function collect(iterator: AsyncGenerator<string>) {
  let text = '';
  for await (const delta of iterator) {
    text += delta;
  }
  return text;
}
