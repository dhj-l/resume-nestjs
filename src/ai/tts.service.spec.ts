import {
  BadGatewayException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import OpenAI, { APIError } from 'openai';
import { TtsService } from './tts.service';

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

describe('TtsService - MiMo 语音合成', () => {
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

  it('should synthesize text into wav audio bytes with default options', async () => {
    mockCreate.mockResolvedValue({
      choices: [
        {
          message: {
            audio: { data: Buffer.from('wav-bytes').toString('base64') },
          },
        },
      ],
    });

    const result = await service.synthesize('请介绍一下事件循环。');

    expect(result.mimeType).toBe('audio/wav');
    expect(result.buffer.toString()).toBe('wav-bytes');
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mimo-v2.5-tts',
        audio: { format: 'wav', voice: '冰糖' },
        messages: [
          {
            role: 'user',
            content:
              '请用专业、沉稳、清晰的面试官语气朗读，语速适中，自然连贯。',
          },
          { role: 'assistant', content: '请介绍一下事件循环。' },
        ],
      }),
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
      };
      return overrides[key] ?? defaultValue;
    });
    mockCreate.mockResolvedValue({
      choices: [{ message: { audio: { data: 'aGk=' } } }],
    });

    await service.synthesize('你好。');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'mimo-v2.5-tts-hd',
        audio: { format: 'wav', voice: '白桦' },
        messages: [
          { role: 'user', content: '请平静地朗读。' },
          { role: 'assistant', content: '你好。' },
        ],
      }),
    );
  });

  it('should omit the style message when MIMO_TTS_STYLE is blank', async () => {
    config.get.mockImplementation((key: string, defaultValue?: string) =>
      key === 'MIMO_TTS_STYLE' ? '  ' : defaultValue,
    );
    mockCreate.mockResolvedValue({
      choices: [{ message: { audio: { data: 'aGk=' } } }],
    });

    await service.synthesize('你好。');

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [{ role: 'assistant', content: '你好。' }],
      }),
    );
  });

  it('should reject empty text without calling the API', async () => {
    await expect(service.synthesize('   ')).rejects.toThrow('不能为空');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should reject text longer than the limit', async () => {
    await expect(service.synthesize('题'.repeat(1001))).rejects.toThrow('过长');
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('should throw when the response lacks audio data', async () => {
    mockCreate.mockResolvedValue({ choices: [{ message: {} }] });
    await expect(service.synthesize('你好。')).rejects.toThrow('没有音频数据');
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
