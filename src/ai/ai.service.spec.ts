import { AiService } from './ai.service';
import { z } from 'zod';

describe('AiService', () => {
  let config: { get: jest.Mock; getOrThrow: jest.Mock };
  let service: AiService;

  beforeEach(() => {
    config = {
      get: jest.fn().mockReturnValue('low'),
      getOrThrow: jest.fn().mockReturnValue('sk-test'),
    };
    service = new AiService(config as any);
  });

  describe('generateAnalyzeResume', () => {
    it('默认使用 deepseek-v4-flash 且思考强度为 low', () => {
      const chat = service.generateAnalyzeResume();
      expect(chat.model).toBe('deepseek-v4-flash');
      expect(chat.modelKwargs).toMatchObject({
        thinking: { type: 'enabled' },
        reasoning_effort: 'low',
      });
    });

    it('disabled 模式关闭思考且不发送 reasoning_effort', () => {
      const chat = service.generateAnalyzeResume('disabled');
      expect(chat.modelKwargs).toMatchObject({
        thinking: { type: 'disabled' },
      });
      expect(chat.modelKwargs).not.toHaveProperty('reasoning_effort');
    });

    it('DEEPSEEK_THINKING_MODE=high 时默认模式跟随环境变量', () => {
      config.get.mockReturnValue('high');
      const chat = service.generateAnalyzeResume();
      expect(chat.modelKwargs).toMatchObject({
        reasoning_effort: 'high',
      });
    });

    it('无效的 DEEPSEEK_THINKING_MODE 回退到 low', () => {
      config.get.mockReturnValue('ultra');
      const chat = service.generateAnalyzeResume();
      expect(chat.modelKwargs).toMatchObject({
        reasoning_effort: 'low',
      });
    });
  });

  describe('generateInterviewOutline', () => {
    it('关闭思考并启用 JSON mode', () => {
      const chat = service.generateInterviewOutline();
      expect(chat.modelKwargs).toMatchObject({
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
      });
      expect(chat.modelKwargs).not.toHaveProperty('reasoning_effort');
    });
  });

  describe('generateInterviewQuestion', () => {
    it('默认开启 low 思考并输出 JSON', () => {
      const chat = service.generateInterviewQuestion();
      expect(chat.modelKwargs).toMatchObject({
        thinking: { type: 'enabled' },
        reasoning_effort: 'low',
        response_format: { type: 'json_object' },
      });
    });

    it('disabled 模式关闭思考', () => {
      const chat = service.generateInterviewQuestion('disabled');
      expect(chat.modelKwargs).toMatchObject({
        thinking: { type: 'disabled' },
      });
      expect(chat.modelKwargs).not.toHaveProperty('reasoning_effort');
    });
  });

  describe('generateInterviewReport', () => {
    it('默认使用 medium 思考', () => {
      const chat = service.generateInterviewReport();
      expect(chat.modelKwargs).toMatchObject({
        thinking: { type: 'enabled' },
        reasoning_effort: 'medium',
      });
    });
  });

  describe('createRobustStructuredParser', () => {
    const schema = z.object({ name: z.string().optional() });

    it('解析纯 JSON', async () => {
      const parser = service.createRobustStructuredParser(schema);
      await expect(
        parser.invoke({ content: '{"name":"张三"}' } as any),
      ).resolves.toEqual({ name: '张三' });
    });

    it('解析 ```json 代码块包裹的 JSON', async () => {
      const parser = service.createRobustStructuredParser(schema);
      await expect(
        parser.invoke({ content: '```json\n{"name":"张三"}\n```' } as any),
      ).resolves.toEqual({ name: '张三' });
    });

    it('解析前后有杂文的 JSON', async () => {
      const parser = service.createRobustStructuredParser(schema);
      await expect(
        parser.invoke({
          content: '以下是结果：\n{"name":"张三"}\n请查收',
        } as any),
      ).resolves.toEqual({ name: '张三' });
    });

    it('空内容抛出解析错误', async () => {
      const parser = service.createRobustStructuredParser(schema);
      await expect(parser.invoke({ content: '' } as any)).rejects.toThrow();
    });

    it('非法 JSON 抛出解析错误', async () => {
      const parser = service.createRobustStructuredParser(schema);
      await expect(
        parser.invoke({ content: '不是 JSON 内容' } as any),
      ).rejects.toThrow();
    });
  });
});
