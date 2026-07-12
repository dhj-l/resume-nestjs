import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepSeekProps } from './type';
import { ChatDeepSeek } from '@langchain/deepseek';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import type { ZodSchema } from 'zod';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  createDefaultDeepSeek(props: DeepSeekProps) {
    const {
      model = 'deepseek-v4-flash',
      apiKey,
      maxTokens = 4000,
      temperature = 0.5,
    } = props;
    const chat = new ChatDeepSeek({
      model,
      apiKey,
      maxTokens,
      temperature,
    });
    return chat;
  }

  /**
   * 简历生成AI模型
   */
  generateResume() {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const chat = this.createDefaultDeepSeek({ apiKey });
    return chat;
  }

  /**
   * 解析简历AI模型
   */
  generateImportResume() {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const chat = this.createDefaultDeepSeek({
      apiKey,
      temperature: 0.1,
      maxTokens: 8192,
    });
    return chat;
  }

  /**
   * 简历生成AI模型(深度思考版)
   */
  generateResumeDeepSeek() {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const chat = this.createDefaultDeepSeek({
      model: 'deepseek-reasoner',
      apiKey,
    });
    return chat;
  }

  /**
   * 创建 Zod 结构化输出解析器
   *
   * 用 Zod schema 替换 JsonOutputParser，DeepSeek 输出不合法 JSON 时自动抛错，
   * 调用方捕获后可重试。schema 使用 .passthrough() 防止未知字段导致解析失败。
   */
  createStructuredParser<T extends ZodSchema>(schema: T) {
    return StructuredOutputParser.fromZodSchema(schema);
  }
}
