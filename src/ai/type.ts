export interface DeepSeekProps {
  model?: 'deepseek-chat' | 'deepseek-reasoner';
  apiKey: string;
  maxTokens?: number;
  temperature?: number;
}
