import { Injectable, Logger } from '@nestjs/common';
import { PromptTemplate } from '@langchain/core/prompts';
import { AiService } from 'src/ai/ai.service';
import { invokeChainWithRetry } from 'src/ai/chain-invoke.utils';
import { formatDate } from 'src/common/utils/date';
import {
  EXPERIENCE_LEVEL_PROMPTS,
  INTERVIEW_MODE_PROMPTS,
  INTERVIEW_STAGE_PROMPTS,
} from '../constants/level.constants';
import type { InterviewMessage } from '../entities/interview-session.entity';
import { MessageRoleEnum } from '../entities/interview-session.entity';
import { interviewReportPrompt } from '../prompt/report.prompt';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
import type { InterviewReport } from '../schemas/interview-report.schema';
import { InterviewReportSchema } from '../schemas/interview-report.schema';
import type { ResolvedLevelConfig } from '../utils/stage-compat';

/** 输入预算（字符）：对话记录可能较长，单独放宽 */
const REPORT_INPUT_BUDGET = 16000;

/**
 * 报告生成单次尝试超时（毫秒）
 *
 * 报告需综合全量对话（长面试转录上万字符）并以 medium 思考模式生成，
 * 单次耗时普遍超过通用 120s 上限——超时只会白白浪费一次尝试再重试
 * （生产实测：120s 超时 + 重试把反问收尾拖到 4 分钟以上），故单独放宽。
 */
const REPORT_TIMEOUT_MS = 240_000;
/** 报告重试次数：单次超时已放宽，最多重试一次，避免收尾等待成倍放大 */
const REPORT_RETRIES = 1;

export interface GenerateReportParams {
  jobDescription: string;
  levelConfig: ResolvedLevelConfig;
  outline: InterviewOutlineTopic[];
  messages: InterviewMessage[];
  /** 面试进行时长（分钟，从会话开始计，含反问环节） */
  durationMinutes: number;
  /** 累计问题数（含反问环节） */
  questionCount: number;
}

/**
 * 面试评价报告生成
 *
 * 基于全量对话与考察大纲，生成逐主题评分 + 三维度总分 + 反问评价的结构化报告。
 * 完成度按时长与题数评估（时长驱动的面试不再有计划轮次概念）。
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

    const chain = PromptTemplate.fromTemplate(interviewReportPrompt)
      .pipe(this.aiService.generateInterviewReport())
      .pipe(this.aiService.createRobustStructuredParser(InterviewReportSchema));

    return invokeChainWithRetry<InterviewReport>(
      chain,
      {
        jd: jobDescription,
        mode_desc: INTERVIEW_MODE_PROMPTS[params.levelConfig.mode],
        stage_desc: INTERVIEW_STAGE_PROMPTS[params.levelConfig.stage],
        experience_level_desc:
          EXPERIENCE_LEVEL_PROMPTS[params.levelConfig.experienceLevel],
        outline_json: JSON.stringify(params.outline),
        transcript: formatTranscript(params.messages) || '（候选人未作答）',
        duration_minutes: String(params.durationMinutes),
        question_count: String(params.questionCount),
        current_date: formatDate(),
      },
      {
        timeoutMs: REPORT_TIMEOUT_MS,
        retries: REPORT_RETRIES,
        label: '报告生成',
        validate: (result) => {
          const report = result as InterviewReport;
          if (
            !report ||
            typeof report.overallScore !== 'number' ||
            !Array.isArray(report.topics) ||
            report.topics.length === 0
          ) {
            throw new Error('AI 返回的报告结构不完整');
          }
        },
      },
    );
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
