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
      // TODO：先写死，后续从配置文件读取
      apiKey: 'sk-897b778ecf344a54bb15a4ed4c49db36',
    });
    return chat;
  }
}
