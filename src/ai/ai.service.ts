import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepSeekProps } from './type';
import { ChatDeepSeek } from '@langchain/deepseek';

@Injectable()
export class AiService {
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
    const chat = this.createDefaultDeepSeek({ apiKey, temperature: 0.1 });
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
}
