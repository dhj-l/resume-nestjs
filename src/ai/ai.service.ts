import { Injectable } from '@nestjs/common';
import { DeepSeekProps } from './type';
import { ChatDeepSeek } from '@langchain/deepseek';
@Injectable()
export class AiService {
  createDefaultDeepSeek(props: DeepSeekProps) {
    const {
      model = 'deepseek-chat',
      apiKey,
      maxTokens = 4000,
      temperature = 0.7,
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
    const chat = this.createDefaultDeepSeek({
      apiKey: process.env.DEEPSEEK_API_KEY || '',
    });
    return chat;
  }
  /**
   * 简历生成AI模型(深度思考版)
   */
  generateResumeDeepSeek() {
    const chat = this.createDefaultDeepSeek({
      model: 'deepseek-reasoner',
      apiKey: process.env.DEEPSEEK_API_KEY || '',
    });
    return chat;
  }
}
