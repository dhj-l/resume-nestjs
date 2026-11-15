import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI, { APIError } from 'openai';
import { TtsService, pcm16ToWav } from './tts.service';
import { TTS_STYLE } from './prompt/tts';

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

/** delta.audio.data 形态的音频 chunk */
function deltaAudioChunk(base64: string) {
  return {
    choices: [{ delta: { audio: { data: base64 } } }],
  };
}

/** message.audio.data 形态的音频 chunk（与非流式响应对齐的兼容形态） */
function messageAudioChunk(base64: string) {
  return {
    choices: [{ message: { audio: { data: base64 } } }],
  };
}

describe('TtsService - MiMo 语音合成（流式）', () => {
  let service: TtsService;

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
      providers: [TtsService, { provide: ConfigService, useValue: config }],
    }).compile();
    service = module.get<TtsService>(TtsService);
  });

  describe('synthesizeStream', () => {
    it('should open the upstream with stream:true and pcm16, and yield decoded chunks', async () => {
      mockCreate.mockResolvedValue(
        makeStream([deltaAudioChunk('aGVsbG8='), deltaAudioChunk('d29ybGQ=')]),
      );

      const handle = await service.synthesizeStream('请介绍一下事件循环。');

      // meta 默认采样率随 MIMO_TTS_SAMPLE_RATE 配置可覆盖
      expect(handle.meta).toEqual({ sampleRate: 24000, channels: 1 });

      const chunks: Buffer[] = [];
      for await (const chunk of handle.iterator) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks).toString()).toBe('helloworld');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mimo-v2.5-tts',
          stream: true,
          audio: { format: 'pcm16', voice: '冰糖' },
          messages: [
            {
              role: 'user',
              content: TTS_STYLE,
            },
            { role: 'assistant', content: '请介绍一下事件循环。' },
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

    it('should read model, voice and style from configuration', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) => {
        const overrides: Record<string, string> = {
          MIMO_TTS_MODEL: 'mimo-v2.5-tts-hd',
          MIMO_TTS_VOICE: '白桦',
          MIMO_TTS_STYLE: '请平静地朗读。',
          MIMO_TTS_SAMPLE_RATE: '16000',
        };
        return overrides[key] ?? defaultValue;
      });
      mockCreate.mockResolvedValue(makeStream([deltaAudioChunk('aGk=')]));

      const handle = await service.synthesizeStream('你好。');

      expect(handle.meta.sampleRate).toBe(16000);
      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mimo-v2.5-tts-hd',
          audio: { format: 'pcm16', voice: '白桦' },
          messages: [
            { role: 'user', content: '请平静地朗读。' },
            { role: 'assistant', content: '你好。' },
          ],
        }),
        expect.anything(),
      );
    });

    it('should omit the style message when MIMO_TTS_STYLE is blank', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) =>
        key === 'MIMO_TTS_STYLE' ? '  ' : defaultValue,
      );
      mockCreate.mockResolvedValue(makeStream([deltaAudioChunk('aGk=')]));

      await service.synthesizeStream('你好。');

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [{ role: 'assistant', content: '你好。' }],
        }),
        expect.anything(),
      );
    });

    it('should reject empty text without calling the API', async () => {
      await expect(service.synthesizeStream('   ')).rejects.toThrow('不能为空');
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should reject text longer than the limit', async () => {
      await expect(service.synthesizeStream('题'.repeat(1001))).rejects.toThrow(
        '过长',
      );
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('should parse message.audio.data chunks (compat shape) as well', async () => {
      mockCreate.mockResolvedValue(
        makeStream([messageAudioChunk('aGk='), deltaAudioChunk('IQ==')]),
      );

      const handle = await service.synthesizeStream('你好。');
      const chunks: Buffer[] = [];
      for await (const chunk of handle.iterator) {
        chunks.push(chunk);
      }
      expect(Buffer.concat(chunks).toString()).toBe('hi!');
    });

    it('should throw when the stream contains no audio data', async () => {
      mockCreate.mockResolvedValue(
        makeStream([
          { choices: [{ delta: { audio: { transcript: 'no data' } } }] },
          { choices: [{ delta: {} }], usage: {} },
        ]),
      );

      await expect(
        service.synthesizeStream('你好。').then((h) => collect(h.iterator)),
      ).rejects.toThrow('没有音频数据');
    });

    it('should abort silently when aborted mid-stream', async () => {
      mockCreate.mockResolvedValue(
        makeStream([deltaAudioChunk('aGk='), deltaAudioChunk('IQ==')]),
      );

      const handle = await service.synthesizeStream('你好。');
      const iterator = handle.iterator;
      await iterator.next(); // 消费第一块
      handle.abort();
      // 中止后迭代立即完成（而非抛错）
      await expect(iterator.next()).resolves.toEqual(
        expect.objectContaining({ done: true }),
      );
    });

    it('should map a mid-stream APIError to a business exception', async () => {
      mockCreate.mockResolvedValue({
        [Symbol.asyncIterator]: async function* () {
          yield deltaAudioChunk('aGk=');
          throw new APIError(429, 'Too many requests', undefined, undefined);
        },
      });

      await expect(
        service.synthesizeStream('你好。').then((h) => collect(h.iterator)),
      ).rejects.toThrow('过于频繁');
    });

    it('should treat an in-stream error payload as a failure', async () => {
      mockCreate.mockResolvedValue(
        makeStream([
          deltaAudioChunk('aGk='),
          { error: { message: 'voice not found' } },
        ]),
      );

      await expect(
        service.synthesizeStream('你好。').then((h) => collect(h.iterator)),
      ).rejects.toThrow('语音合成失败');
    });

    it('should fall back to the non-stream wav path when the model rejects pcm16 streaming', async () => {
      // 旧模型（mimo-v2.5-tts-voicedesign）不支持 pcm16 + stream:true，
      // 上游返回 400 Param Incorrect：存量部署配置旧模型时应回退
      // 非流式通路而不是全部硬失败
      const legacyWav = pcm16ToWav(Buffer.from('legacy-pcm'), {
        sampleRate: 16000,
        channels: 1,
      });
      mockCreate
        .mockRejectedValueOnce(
          new APIError(400, 'Param Incorrect', undefined, undefined),
        )
        .mockResolvedValueOnce({
          choices: [
            { message: { audio: { data: legacyWav.toString('base64') } } },
          ],
        });

      const handle = await service.synthesizeStream('你好。');
      const chunks: Buffer[] = [];
      for await (const chunk of handle.iterator) {
        chunks.push(chunk);
      }

      expect(Buffer.concat(chunks).toString()).toBe('legacy-pcm');
      // 回退请求为非流式（无 stream 键），audio.format 退回 wav
      const fallbackBody = mockCreate.mock.calls[1][0];
      expect('stream' in fallbackBody).toBe(false);
      expect(fallbackBody.audio).toEqual({ format: 'wav', voice: '冰糖' });
      // 采样率/声道取自 wav 头，而非环境变量默认值
      expect(handle.meta).toEqual({ sampleRate: 16000, channels: 1 });
    });

    it('should surface the upstream error when the non-stream fallback also fails', async () => {
      mockCreate
        .mockRejectedValueOnce(
          new APIError(400, 'Param Incorrect', undefined, undefined),
        )
        .mockRejectedValueOnce(
          new APIError(400, 'voice not found', undefined, undefined),
        );

      await expect(service.synthesizeStream('你好。')).rejects.toThrow(
        '语音合成失败',
      );
      expect(mockCreate).toHaveBeenCalledTimes(2);
    });

    it('should fail with a business error when the upstream stalls mid-stream', async () => {
      // OpenAI SDK 对 stream:true 跳过 timeout 竞态：上游停发数据时
      // 消费循环必须靠自身的整体 deadline 兜底，而不是永久挂起
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        mockCreate.mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            yield deltaAudioChunk('aGk=');
            await new Promise(() => {}); // 模拟上游中途停发数据
          },
        });

        const handle = await service.synthesizeStream('你好。');
        const consume = (async () => {
          for await (const chunk of handle.iterator) {
            void chunk;
          }
        })();
        const assertion = expect(consume).rejects.toThrow(BadGatewayException);

        // 整体合成 deadline（10 分钟）耗尽后应报错而非永久挂起
        await jest.advanceTimersByTimeAsync(10 * 60 * 1000 + 1);
        await assertion;
      } finally {
        jest.useRealTimers();
      }
    });

    it('should not time out a healthy stream that keeps producing chunks', async () => {
      // 每块间隔小于 deadline 的正常流不应被误杀
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        mockCreate.mockResolvedValue({
          [Symbol.asyncIterator]: async function* () {
            for (let i = 0; i < 5; i++) {
              yield deltaAudioChunk('aGk=');
            }
          },
        });

        const handle = await service.synthesizeStream('你好。');
        const chunks: Buffer[] = [];
        for await (const chunk of handle.iterator) {
          chunks.push(chunk);
        }
        expect(chunks).toHaveLength(5);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('synthesize', () => {
    it('should assemble streamed PCM into a valid wav file', async () => {
      mockCreate.mockResolvedValue(
        makeStream([deltaAudioChunk('aGVsbG8='), deltaAudioChunk('d29ybGQ=')]),
      );

      const result = await service.synthesize('请介绍一下事件循环。');

      expect(result.mimeType).toBe('audio/wav');
      const wav = result.buffer;
      expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
      // 44 字节标准头：PCM / 单声道 / 24000Hz / 16bit
      expect(wav.readUInt16LE(20)).toBe(1);
      expect(wav.readUInt16LE(22)).toBe(1);
      expect(wav.readUInt32LE(24)).toBe(24000);
      expect(wav.readUInt16LE(34)).toBe(16);
      expect(wav.readUInt32LE(40)).toBe(10); // 'helloworld'.length
      expect(wav.subarray(44).toString()).toBe('helloworld');
    });

    it('should fall back to default sample rate when config is invalid', async () => {
      config.get.mockImplementation((key: string, defaultValue?: string) =>
        key === 'MIMO_TTS_SAMPLE_RATE' ? 'abc' : defaultValue,
      );
      mockCreate.mockResolvedValue(makeStream([deltaAudioChunk('aGk=')]));

      const result = await service.synthesize('你好。');
      expect(result.buffer.readUInt32LE(24)).toBe(24000);
    });
  });

  describe('remote API error handling', () => {
    it('should map 402 to a 502 balance error', async () => {
      mockCreate.mockRejectedValue(
        new APIError(402, 'Insufficient account balance', undefined, undefined),
      );
      await expect(service.synthesize('你好。')).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.synthesize('你好。')).rejects.toThrow('余额不足');
    });

    it('should map 401 to a 502 auth error', async () => {
      mockCreate.mockRejectedValue(
        new APIError(401, 'Invalid API key', undefined, undefined),
      );
      await expect(service.synthesize('你好。')).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.synthesize('你好。')).rejects.toThrow(
        '请检查 MIMO_API_KEY',
      );
    });

    it('should map 429 to a 502 rate-limit error', async () => {
      mockCreate.mockRejectedValue(
        new APIError(429, 'Too many requests', undefined, undefined),
      );
      await expect(service.synthesize('你好。')).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.synthesize('你好。')).rejects.toThrow('过于频繁');
    });

    it('should wrap other API errors with a 502 generic message', async () => {
      mockCreate.mockRejectedValue(
        new APIError(500, 'server error', undefined, undefined),
      );
      await expect(service.synthesize('你好。')).rejects.toThrow(
        BadGatewayException,
      );
      await expect(service.synthesize('你好。')).rejects.toThrow(
        '语音合成失败',
      );
    });

    it('should wrap unexpected errors as a 500 generic failure', async () => {
      mockCreate.mockRejectedValue(new Error('network down'));
      await expect(service.synthesize('你好。')).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.synthesize('你好。')).rejects.toThrow('请稍后重试');
    });

    it('should map missing MIMO_API_KEY config to 500', async () => {
      config.getOrThrow.mockImplementation(() => {
        throw new Error('MIMO_API_KEY is not configured');
      });
      await expect(service.synthesize('你好。')).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});

async function collect(iterator: AsyncGenerator<Buffer>) {
  const chunks: Buffer[] = [];
  for await (const chunk of iterator) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

describe('pcm16ToWav', () => {
  it('should build a standard RIFF header around PCM bytes', () => {
    const pcm = Buffer.from([1, 0, 2, 0]);
    const wav = pcm16ToWav(pcm, { sampleRate: 8000, channels: 1 });

    expect(wav.subarray(0, 4).toString('ascii')).toBe('RIFF');
    expect(wav.subarray(8, 12).toString('ascii')).toBe('WAVE');
    expect(wav.readUInt32LE(24)).toBe(8000);
    expect(wav.readUInt32LE(28)).toBe(16000); // byteRate = 8000 * 2
    expect(wav.readUInt32LE(40)).toBe(4);
    expect(wav.length).toBe(48);
  });
});
