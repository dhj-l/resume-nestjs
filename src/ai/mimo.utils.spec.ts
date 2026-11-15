import {
  BadGatewayException,
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI, { APIError } from 'openai';
import {
  createMimoClient,
  raceWithDeadline,
  resolvePositiveInt,
  wrapMimoError,
} from './mimo.utils';

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

describe('mimo.utils - MiMo 语音服务共享脚手架', () => {
  describe('createMimoClient', () => {
    it('should build the client from MIMO_API_KEY and default base URL', () => {
      const config = {
        getOrThrow: jest.fn().mockReturnValue('sk-mimo-test'),
        get: jest
          .fn()
          .mockImplementation(
            (key: string, defaultValue?: string) => defaultValue,
          ),
      } as unknown as ConfigService;

      createMimoClient(config, 30000);

      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'sk-mimo-test',
        baseURL: 'https://api.xiaomimimo.com/v1',
        timeout: 30000,
        maxRetries: 1,
      });
    });

    it('should honor a configured base URL', () => {
      const config = {
        getOrThrow: jest.fn().mockReturnValue('sk-mimo-test'),
        get: jest
          .fn()
          .mockImplementation((key: string, defaultValue?: string) =>
            key === 'MIMO_BASE_URL'
              ? 'https://proxy.example.com/v1'
              : defaultValue,
          ),
      } as unknown as ConfigService;

      createMimoClient(config, 30000);

      expect(OpenAI).toHaveBeenCalledWith(
        expect.objectContaining({ baseURL: 'https://proxy.example.com/v1' }),
      );
    });
  });

  describe('wrapMimoError', () => {
    const context = { label: 'TTS', scenario: '语音合成' };

    it('should pass business exceptions through unchanged', () => {
      const business = new BadRequestException('文本非法');
      expect(wrapMimoError(business, context)).toBe(business);
      const gateway = new BadGatewayException('远端流异常');
      expect(wrapMimoError(gateway, context)).toBe(gateway);
    });

    it('should map 402 to a balance hint', () => {
      const result = wrapMimoError(
        new APIError(402, 'Insufficient balance', undefined, undefined),
        context,
      );
      expect(result).toBeInstanceOf(BadGatewayException);
      expect((result as Error).message).toContain('余额不足');
    });

    it('should map 401 to an auth hint', () => {
      const result = wrapMimoError(
        new APIError(401, 'Invalid key', undefined, undefined),
        context,
      );
      expect((result as Error).message).toContain('MIMO_API_KEY');
    });

    it('should map 429 to a rate-limit hint', () => {
      const result = wrapMimoError(
        new APIError(429, 'Too many requests', undefined, undefined),
        context,
      );
      expect((result as Error).message).toContain('过于频繁');
    });

    it('should map other API errors to a scenario-specific 502', () => {
      const result = wrapMimoError(
        new APIError(500, 'server error', undefined, undefined),
        context,
      );
      expect(result).toBeInstanceOf(BadGatewayException);
      expect((result as Error).message).toBe('语音合成失败：server error');
    });

    it('should map unexpected errors to a scenario-specific 500', () => {
      const result = wrapMimoError(new Error('network down'), context);
      expect(result).toBeInstanceOf(InternalServerErrorException);
      expect((result as Error).message).toBe('语音合成失败，请稍后重试');
    });
  });

  describe('raceWithDeadline', () => {
    it('should resolve with the wrapped promise value when it settles in time', async () => {
      await expect(
        raceWithDeadline(Promise.resolve('ok'), 1000, { message: '超时' }),
      ).resolves.toBe('ok');
    });

    it('should reject with the wrapped promise error when it fails in time', async () => {
      const onTimeout = jest.fn();
      await expect(
        raceWithDeadline(Promise.reject(new Error('boom')), 1000, {
          onTimeout,
          message: '超时',
        }),
      ).rejects.toThrow('boom');
      expect(onTimeout).not.toHaveBeenCalled();
    });

    it('should trigger onTimeout and reject with a 502 when the deadline expires', async () => {
      jest.useFakeTimers({ doNotFake: ['queueMicrotask'] });
      try {
        const onTimeout = jest.fn();
        const pending = new Promise<never>(() => {});
        const raced = raceWithDeadline(pending, 5000, {
          onTimeout,
          message: '上游响应超时',
        });

        const assertion = expect(raced).rejects.toThrow(BadGatewayException);
        await jest.advanceTimersByTimeAsync(5001);
        await assertion;
        expect(onTimeout).toHaveBeenCalledTimes(1);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('resolvePositiveInt', () => {
    const makeConfig = (values: Record<string, string | undefined>) =>
      ({
        get: jest.fn((key: string) => values[key]),
      }) as unknown as ConfigService;

    it('should return the configured value when it is a positive integer', () => {
      expect(
        resolvePositiveInt(makeConfig({ MIMO_X: '16000' }), 'MIMO_X', 24000),
      ).toBe(16000);
    });

    it('should fall back to the default when unset', () => {
      expect(resolvePositiveInt(makeConfig({}), 'MIMO_X', 24000)).toBe(24000);
    });

    it('should fall back to the default when the value is invalid', () => {
      expect(
        resolvePositiveInt(makeConfig({ MIMO_X: 'abc' }), 'MIMO_X', 24000),
      ).toBe(24000);
      expect(
        resolvePositiveInt(makeConfig({ MIMO_X: '-3' }), 'MIMO_X', 24000),
      ).toBe(24000);
    });
  });
});
