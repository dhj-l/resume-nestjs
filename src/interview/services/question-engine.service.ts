import { Injectable, Logger } from '@nestjs/common';
import { PromptTemplate } from '@langchain/core/prompts';
import { AiService } from 'src/ai/ai.service';
import {
  ANALYSIS_TIMEOUT_MS,
  buildTruncatedAnalysisContext,
} from 'src/resume-ai/analysis.utils';
import {
  DEFAULT_TARGET_ROUNDS,
  EXPERIENCE_LEVEL_PROMPTS,
  FOCUS_TARGET_ROUNDS,
  INTERVIEW_FOCUS_PROMPTS,
} from '../constants/level.constants';
import type { LevelConfig } from '../entities/level-config.entity';
import type { InterviewMessage } from '../entities/interview-session.entity';
import { MessageRoleEnum } from '../entities/interview-session.entity';
import { interviewOutlinePrompt } from '../prompt/outline.prompt';
import { interviewQuestionPrompt } from '../prompt/question.prompt';
import type { InterviewQuestionDecision } from '../schemas/interview-question.schema';
import { InterviewQuestionDecisionSchema } from '../schemas/interview-question.schema';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
import { InterviewOutlineSchema } from '../schemas/interview-outline.schema';

/** AI 调用失败重试次数（不含首次） */
const MAX_RETRIES = 2;
/** 送入提示词的最近对话条数上限 */
const HISTORY_MESSAGE_LIMIT = 10;
/** 输入预算（字符） */
const INPUT_BUDGET = 8000;

export interface GenerateOutlineParams {
  jobDescription: string;
  resume: Record<string, any>;
  levelConfig: LevelConfig;
}

export interface GenerateNextQuestionParams {
  jobDescription: string;
  resume: Record<string, any>;
  levelConfig: LevelConfig;
  /** 考察大纲主题列表 */
  outline: InterviewOutlineTopic[];
  /** 完整对话记录 */
  messages: InterviewMessage[];
  /** 已考察的主题 key 列表 */
  askedTopicKeys: string[];
  round: number;
}

/**
 * 面试出题引擎
 *
 * 负责 AI 编排：生成考察大纲、逐题生成与追问决策。
 * 纯文本输入输出，不感知传输层（REST/SSE/WebRTC 均可复用）。
 */
@Injectable()
export class QuestionEngineService {
  private readonly logger = new Logger(QuestionEngineService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * 根据级别配置计算目标轮次
   */
  resolveTargetRounds(levelConfig: LevelConfig): number {
    return FOCUS_TARGET_ROUNDS[levelConfig.focus] ?? DEFAULT_TARGET_ROUNDS;
  }

  /**
   * 会话创建时生成考察大纲（只含主题，不含具体题目）
   */
  async generateOutline(
    params: GenerateOutlineParams,
  ): Promise<InterviewOutlineTopic[]> {
    const targetRounds = this.resolveTargetRounds(params.levelConfig);
    const { resumeContent, jobDescription } = buildTruncatedAnalysisContext(
      params.resume,
      params.jobDescription,
      INPUT_BUDGET,
    );

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const chain = PromptTemplate.fromTemplate(interviewOutlinePrompt)
          .pipe(this.aiService.generateInterviewOutline())
          .pipe(
            this.aiService.createRobustStructuredParser(InterviewOutlineSchema),
          );

        const result = (await this.invokeWithTimeout(chain, {
          jd: jobDescription,
          resume_content: resumeContent,
          experience_level_desc:
            EXPERIENCE_LEVEL_PROMPTS[params.levelConfig.experienceLevel],
          focus_desc: INTERVIEW_FOCUS_PROMPTS[params.levelConfig.focus],
          topic_count: String(targetRounds),
          current_date: formatDate(),
        })) as { topics: InterviewOutlineTopic[] };

        if (!result.topics?.length) {
          throw new Error('AI 返回的大纲为空');
        }
        return result.topics;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `大纲生成第 ${attempt + 1} 次尝试失败：${error.message}`,
        );
      }
    }
    throw lastError ?? new Error('大纲生成失败');
  }

  /**
   * 生成下一题（或追问），并给出结束建议
   */
  async generateNextQuestion(
    params: GenerateNextQuestionParams,
  ): Promise<InterviewQuestionDecision> {
    const { resumeContent, jobDescription } = buildTruncatedAnalysisContext(
      params.resume,
      params.jobDescription,
      INPUT_BUDGET,
    );

    const remainingTopics = params.outline.filter(
      (topic) => !params.askedTopicKeys.includes(topic.key),
    );

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const chain = PromptTemplate.fromTemplate(interviewQuestionPrompt)
          .pipe(this.aiService.generateInterviewQuestion())
          .pipe(
            this.aiService.createRobustStructuredParser(
              InterviewQuestionDecisionSchema,
            ),
          );

        const decision = (await this.invokeWithTimeout(chain, {
          jd: jobDescription,
          resume_content: resumeContent,
          experience_level_desc:
            EXPERIENCE_LEVEL_PROMPTS[params.levelConfig.experienceLevel],
          focus_desc: INTERVIEW_FOCUS_PROMPTS[params.levelConfig.focus],
          outline_json: JSON.stringify(params.outline),
          remaining_topics:
            JSON.stringify(remainingTopics) || '（全部主题已覆盖）',
          conversation_history:
            formatConversationHistory(params.messages) ||
            '（尚无对话，这是第一题）',
          round: String(params.round),
          target_rounds: String(this.resolveTargetRounds(params.levelConfig)),
        })) as InterviewQuestionDecision;

        if (!decision.question?.trim()) {
          throw new Error('AI 返回的题目为空');
        }
        return decision;
      } catch (error: any) {
        lastError = error;
        this.logger.warn(`出题第 ${attempt + 1} 次尝试失败：${error.message}`);
      }
    }
    throw lastError ?? new Error('出题失败');
  }

  private async invokeWithTimeout(
    chain: { invoke: (input: any, options?: any) => Promise<any> },
    input: Record<string, string>,
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
    try {
      return await chain.invoke(input, { signal: controller.signal });
    } catch (error: any) {
      if (controller.signal.aborted) {
        throw new Error('AI 出题超时');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}

function formatDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatConversationHistory(messages: InterviewMessage[]): string {
  return messages
    .slice(-HISTORY_MESSAGE_LIMIT)
    .map(
      (message) =>
        `${
          message.role === MessageRoleEnum.Interviewer ? '面试官' : '候选人'
        }：${message.content}`,
    )
    .join('\n');
}
