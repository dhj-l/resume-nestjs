import { Injectable, Logger } from '@nestjs/common';
import { PromptTemplate } from '@langchain/core/prompts';
import { AiService } from 'src/ai/ai.service';
import { ANALYSIS_TIMEOUT_MS } from 'src/resume-ai/analysis.utils';
import {
  EXPERIENCE_LEVEL_PROMPTS,
  INTERVIEW_FOCUS_PROMPTS,
} from '../constants/level.constants';
import type { LevelConfig } from '../entities/level-config.entity';
import type { InterviewMessage } from '../entities/interview-session.entity';
import { MessageRoleEnum } from '../entities/interview-session.entity';
import { interviewReportPrompt } from '../prompt/report.prompt';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
import type { InterviewReport } from '../schemas/interview-report.schema';
import { InterviewReportSchema } from '../schemas/interview-report.schema';

/** AI 调用失败重试次数（不含首次） */
const MAX_RETRIES = 2;
/** 输入预算（字符）：对话记录可能较长，单独放宽 */
const REPORT_INPUT_BUDGET = 16000;

export interface GenerateReportParams {
  jobDescription: string;
  levelConfig: LevelConfig;
  outline: InterviewOutlineTopic[];
  messages: InterviewMessage[];
  round: number;
}

/**
 * 面试评价报告生成
 *
 * 基于全量对话与考察大纲，生成逐主题评分 + 总分的结构化报告。
 */
@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * 生成面试评价报告
   */
  async generateReport(params: GenerateReportParams): Promise<InterviewReport> {
    const jobDescription =
      params.jobDescription.length > REPORT_INPUT_BUDGET
        ? params.jobDescription.slice(0, REPORT_INPUT_BUDGET)
        : params.jobDescription;

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const chain = PromptTemplate.fromTemplate(interviewReportPrompt)
          .pipe(this.aiService.generateInterviewReport())
          .pipe(
            this.aiService.createRobustStructuredParser(InterviewReportSchema),
          );

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), ANALYSIS_TIMEOUT_MS);
        try {
          const result = (await chain.invoke(
            {
              jd: jobDescription,
              experience_level_desc:
                EXPERIENCE_LEVEL_PROMPTS[params.levelConfig.experienceLevel],
              focus_desc: INTERVIEW_FOCUS_PROMPTS[params.levelConfig.focus],
              outline_json: JSON.stringify(params.outline),
              transcript:
                formatTranscript(params.messages) || '（候选人未作答）',
              round: String(params.round),
              target_rounds: String(params.round),
              current_date: formatDate(),
            },
            { signal: controller.signal },
          )) as InterviewReport;
          if (
            !result ||
            typeof result.overallScore !== 'number' ||
            !Array.isArray(result.topics) ||
            result.topics.length === 0
          ) {
            throw new Error('AI 返回的报告结构不完整');
          }
          return result;
        } catch (error: any) {
          if (controller.signal.aborted) {
            throw new Error('报告生成超时');
          }
          throw error;
        } finally {
          clearTimeout(timer);
        }
      } catch (error: any) {
        lastError = error;
        this.logger.warn(
          `报告生成第 ${attempt + 1} 次尝试失败：${error.message}`,
        );
      }
    }
    throw lastError ?? new Error('报告生成失败');
  }
}

function formatTranscript(messages: InterviewMessage[]): string {
  return messages
    .map(
      (message) =>
        `${
          message.role === MessageRoleEnum.Interviewer ? '面试官' : '候选人'
        }（第 ${message.round} 轮）：${message.content}`,
    )
    .join('\n\n');
}

function formatDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
