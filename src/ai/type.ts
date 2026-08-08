export type DeepSeekThinkingMode = 'disabled' | 'low' | 'medium' | 'high';

export interface DeepSeekProps {
  model?: string;
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
  thinking?: 'enabled' | 'disabled';
  reasoningEffort?: DeepSeekThinkingMode;
}
