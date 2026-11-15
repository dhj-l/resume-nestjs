export type DeepSeekThinkingMode = 'disabled' | 'low' | 'medium' | 'high';

export interface DeepSeekProps {
  model?: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  thinking?: 'enabled' | 'disabled';
  reasoningEffort?: DeepSeekThinkingMode;
  /** 额外透传给模型请求体的参数（如 response_format） */
  modelKwargs?: Record<string, unknown>;
}
