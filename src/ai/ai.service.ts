import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DeepSeekProps, DeepSeekThinkingMode } from './type';
import { ChatDeepSeek } from '@langchain/deepseek';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { RunnableLambda } from '@langchain/core/runnables';
import type { BaseMessage } from '@langchain/core/messages';
import type { ZodSchema } from 'zod';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);

  constructor(private readonly config: ConfigService) {}

  createDefaultDeepSeek(props: DeepSeekProps) {
    const {
      model = 'deepseek-v4-flash',
      apiKey,
      maxTokens = 30000,
      temperature = 0.5,
      thinking,
      reasoningEffort,
    } = props;

    const modelKwargs: Record<string, unknown> = { ...props.modelKwargs };
    if (thinking === 'disabled') {
      modelKwargs.thinking = { type: 'disabled' };
    } else if (thinking === 'enabled' && reasoningEffort) {
      modelKwargs.thinking = { type: 'enabled' };
      modelKwargs.reasoning_effort = reasoningEffort;
    }

    const chat = new ChatDeepSeek({
      model,
      apiKey,
      maxTokens,
      temperature,
      modelKwargs:
        Object.keys(modelKwargs).length > 0 ? modelKwargs : undefined,
    });
    return chat;
  }

  /**
   * 简历生成AI模型
   */
  generateResume() {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const chat = this.createDefaultDeepSeek({
      apiKey,
      modelKwargs: {
        response_format: { type: 'json_object' },
      },
    });
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
      maxTokens: 36384,
    });
    return chat;
  }

  /**
   * 简历分析AI模型（低温 + 大 token 上限，适应复杂分析输出）
   * @param mode 思考模式：disabled | low | medium | high，默认读取
   * DEEPSEEK_THINKING_MODE（默认 low）
   */
  generateAnalyzeResume(mode?: DeepSeekThinkingMode) {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const thinkingMode = mode ?? this.resolveThinkingMode();
    const chat = this.createDefaultDeepSeek({
      apiKey,
      temperature: 0.1,
      maxTokens: 36384,
      thinking: thinkingMode === 'disabled' ? 'disabled' : 'enabled',
      reasoningEffort: thinkingMode === 'disabled' ? undefined : thinkingMode,
    });
    return chat;
  }

  /**
   * 面试押题AI模型
   *
   * 输出规模受题目数量/字数上限约束，使用低温 + 关闭思考 + 中等 token 上限，
   * 在保证 JSON 稳定性的同时控制 token 消耗。
   */
  generateInterviewQuestions() {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const chat = this.createDefaultDeepSeek({
      apiKey,
      temperature: 0.3,
      maxTokens: 12000,
      thinking: 'disabled',
      modelKwargs: {
        response_format: { type: 'json_object' },
      },
    });
    return chat;
  }

  /**
   * 模拟面试考察大纲生成AI模型
   *
   * 输出为主题清单 JSON，使用低温 + 关闭思考 + JSON mode 保证结构稳定。
   */
  generateInterviewOutline() {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const chat = this.createDefaultDeepSeek({
      apiKey,
      temperature: 0.3,
      maxTokens: 8000,
      thinking: 'disabled',
      modelKwargs: {
        response_format: { type: 'json_object' },
      },
    });
    return chat;
  }

  /**
   * 模拟面试出题/追问AI模型
   *
   * 对话式逐题生成，输出为 JSON 结构的题目对象；
   * 追问决策需要结合候选人上一轮回答判断，默认开启 low 思考提升质量。
   *
   * 注意：思考模式下不可叠加 response_format=json_object，
   * 否则模型会偶发性地把回答整体写入思考通道，正文 content 为空。
   * JSON 稳定性由提示词 + createRobustStructuredParser 保证。
   * @param mode 思考模式：disabled | low | medium | high
   */
  generateInterviewQuestion(mode?: DeepSeekThinkingMode) {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const thinkingMode = mode ?? this.resolveThinkingMode();
    const chat = this.createDefaultDeepSeek({
      apiKey,
      temperature: 0.6,
      maxTokens: 6000,
      thinking: thinkingMode === 'disabled' ? 'disabled' : 'enabled',
      reasoningEffort: thinkingMode === 'disabled' ? undefined : thinkingMode,
      modelKwargs:
        thinkingMode === 'disabled'
          ? { response_format: { type: 'json_object' } }
          : undefined,
    });
    return chat;
  }

  /**
   * 模拟面试评价报告生成AI模型
   *
   * 需要综合全量对话给出逐主题评分与总评，默认 medium 思考保证报告质量。
   * 与 generateInterviewQuestion 同理：思考模式下不叠加 response_format，
   * 避免偶发空正文。
   */
  generateInterviewReport(mode?: DeepSeekThinkingMode) {
    const apiKey = this.config.getOrThrow<string>('DEEPSEEK_API_KEY');
    const thinkingMode = mode ?? 'medium';
    const chat = this.createDefaultDeepSeek({
      apiKey,
      temperature: 0.2,
      maxTokens: 16000,
      thinking: thinkingMode === 'disabled' ? 'disabled' : 'enabled',
      reasoningEffort: thinkingMode === 'disabled' ? undefined : thinkingMode,
      modelKwargs:
        thinkingMode === 'disabled'
          ? { response_format: { type: 'json_object' } }
          : undefined,
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

  /**
   * 创建稳健的结构化输出解析器
   *
   * 直接解析失败时依次尝试：剥离 markdown 代码块 → 截取首尾 {...}，
   * 最后再交给 Zod 校验，降低模型输出带杂文/代码围栏导致的解析失败。
   */
  createRobustStructuredParser<T extends ZodSchema>(schema: T) {
    const zodParser = StructuredOutputParser.fromZodSchema(schema);
    return RunnableLambda.from(async (message: BaseMessage) => {
      const text = extractJsonText(extractMessageContent(message));
      return zodParser.parse(text);
    });
  }

  private resolveThinkingMode(): DeepSeekThinkingMode {
    const configured = this.config.get<string>('DEEPSEEK_THINKING_MODE', 'low');
    if (
      configured === 'disabled' ||
      configured === 'low' ||
      configured === 'medium' ||
      configured === 'high'
    ) {
      return configured;
    }
    return 'low';
  }
}

function extractMessageContent(message: BaseMessage): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join('');
  }
  return JSON.stringify(message.content ?? '');
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error('AI 返回内容为空');
  }
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    return trimmed;
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const fencedText = fenced[1].trim();
    if (fencedText.startsWith('{') && fencedText.endsWith('}')) {
      return fencedText;
    }
  }

  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}
