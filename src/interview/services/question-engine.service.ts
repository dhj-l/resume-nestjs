import { Injectable, Logger } from '@nestjs/common';
import { AiService } from 'src/ai/ai.service';
import { formatDate } from 'src/common/utils/date';
import {
  ANALYSIS_INPUT_BUDGET,
  buildTruncatedAnalysisContext,
} from 'src/resume-ai/analysis.utils';
import {
  MAX_REVERSE_QUESTIONS,
  MIN_MAIN_DURATION_MS,
  QuestionTypeEnum,
  SOFT_MAX_MAIN_QUESTIONS,
} from '../constants/level.constants';
import type { InterviewMessage } from '../entities/interview-session.entity';
import { interviewOutlinePrompt } from '../prompt/outline.prompt';
import { interviewQuestionPrompt } from '../prompt/question.prompt';
import { interviewReversePrompt } from '../prompt/reverse.prompt';
import { interviewReverseSuggestionsPrompt } from '../prompt/reverse-suggestions.prompt';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
import {
  InterviewOutlineSchema,
  OUTLINE_TOPIC_COUNT_MAX,
} from '../schemas/interview-outline.schema';
import type { InterviewTurnDecision } from '../schemas/interview-question.schema';
import { InterviewTurnDecisionSchema } from '../schemas/interview-question.schema';
import type { InterviewReverseResponse } from '../schemas/interview-reverse.schema';
import { InterviewReverseResponseSchema } from '../schemas/interview-reverse.schema';
import type { InterviewReverseSuggestion } from '../schemas/interview-reverse-suggestions.schema';
import {
  InterviewReverseSuggestionsSchema,
  REVERSE_SUGGESTIONS_MAX,
} from '../schemas/interview-reverse-suggestions.schema';
import { invokeStructuredChain } from '../utils/structured-chain.utils';
import { buildPersonaVariables } from '../utils/prompt-vars.utils';
import { formatConversationHistory } from '../utils/transcript.utils';
import type { EndPolicy, ResolvedLevelConfig } from '../utils/stage-compat';

export interface GenerateOutlineParams {
  jobDescription: string;
  resume: Record<string, any>;
  levelConfig: ResolvedLevelConfig;
}

export interface GenerateTurnParams {
  jobDescription: string;
  resume: Record<string, any>;
  levelConfig: ResolvedLevelConfig;
  /** 考察大纲主题列表 */
  outline: InterviewOutlineTopic[];
  /** 完整对话记录 */
  messages: InterviewMessage[];
  /** 已考察的主题 key 列表 */
  askedTopicKeys: string[];
  /** 主体阶段已进行分钟数 */
  elapsedMinutes: number;
  /** 已提问的面试官问题总数 */
  askedCount: number;
  /** 时长驱动的结束政策 */
  endPolicy: EndPolicy;
}

export interface GenerateReverseResponseParams {
  jobDescription: string;
  resume: Record<string, any>;
  levelConfig: ResolvedLevelConfig;
  /** 完整对话记录（含反问环节对话） */
  messages: InterviewMessage[];
  /** 候选人已反问次数 */
  reverseCount: number;
}

export interface GenerateReverseSuggestionsParams {
  jobDescription: string;
  resume: Record<string, any>;
  levelConfig: ResolvedLevelConfig;
  /** 完整对话记录（可用于顺势追问） */
  messages: InterviewMessage[];
}

/**
 * 面试出题引擎
 *
 * 负责 AI 编排：生成考察大纲、回合决策（反馈+下一题+结束判断）、
 * 反问环节回应、反问建议推荐。
 * 纯文本输入输出，不感知传输层（REST/SSE/WebRTC 均可复用）。
 */
@Injectable()
export class QuestionEngineService {
  private readonly logger = new Logger(QuestionEngineService.name);

  constructor(private readonly aiService: AiService) {}

  /**
   * 会话创建时生成考察大纲（只含主题，不含具体题目）
   *
   * 主题数量按大纲上限规划（主体阶段由时长驱动结束，长面试可能
   * 覆盖全部主题后继续大纲外自主出题）。第一个主题强制为自我介绍。
   */
  async generateOutline(
    params: GenerateOutlineParams,
  ): Promise<InterviewOutlineTopic[]> {
    const result = await invokeStructuredChain<{
      topics: InterviewOutlineTopic[];
    }>(this.aiService, {
      promptTemplate: interviewOutlinePrompt,
      llm: this.aiService.generateInterviewOutline(),
      schema: InterviewOutlineSchema,
      variables: {
        ...this.chainVariables(params),
        topic_count: String(OUTLINE_TOPIC_COUNT_MAX),
        current_date: formatDate(),
      },
      label: '大纲生成',
      validate: (result) => {
        if (!(result as { topics?: unknown[] })?.topics?.length) {
          throw new Error('AI 返回的大纲为空');
        }
      },
    });
    return normalizeOutlineTopics(result.topics);
  }

  /**
   * 回合决策：评价候选人刚提交的回答（三维度反馈），并决定下一动作
   * （追问 / 推进大纲 / 大纲外自主出题 / 按结束政策进入反问环节）
   */
  async generateTurn(
    params: GenerateTurnParams,
  ): Promise<InterviewTurnDecision> {
    const remainingTopics = params.outline.filter(
      (topic) => !params.askedTopicKeys.includes(topic.key),
    );

    return invokeStructuredChain<InterviewTurnDecision>(this.aiService, {
      promptTemplate: interviewQuestionPrompt,
      llm: this.aiService.generateInterviewQuestion(),
      schema: InterviewTurnDecisionSchema,
      variables: {
        ...this.chainVariables(params),
        elapsed_minutes: String(params.elapsedMinutes),
        asked_count: String(params.askedCount),
        end_policy_desc: formatEndPolicyDesc(
          params.endPolicy,
          params.elapsedMinutes,
          params.askedCount,
        ),
        outline_json: JSON.stringify(params.outline),
        // 空数组序列化为真值字符串 "[]"，必须显式区分，否则模型收不到
        // “全部覆盖”的信号，无法触发大纲外自主出题
        remaining_topics: remainingTopics.length
          ? JSON.stringify(remainingTopics)
          : '（大纲主题已全部覆盖，请基于 JD 与简历自主出题，优先继续深挖项目）',
        conversation_history:
          formatConversationHistory(params.messages) ||
          '（尚无对话，这是第一题）',
      },
      label: '回合决策',
      validate: (result) => {
        const decision = result as InterviewTurnDecision;
        if (!decision?.feedback || !decision?.question?.trim()) {
          throw new Error('AI 返回的回合决策不完整');
        }
        // 主体考察出题必须携带 topicKey（追问复用上一题 key、自主出题
        // adhoc_ 前缀），缺失会让主题覆盖追踪（askedTopicKeys/
        // remaining_topics）出现缺口；仅收尾语（shouldEndMainPhase=true）
        // 无需主题。校验失败由 invokeChainWithRetry 触发重试
        if (!decision.shouldEndMainPhase && !decision.topicKey?.trim()) {
          throw new Error('AI 返回的回合决策缺少 topicKey');
        }
        // 连环问兜底：一轮提问只允许一个疑问点。问号计数剔除 ?. 与 ??
        // 运算符（如 a?.b、a ?? b），避免技术名词被误判为连环问；
        // 校验失败由 invokeChainWithRetry 触发重试
        if (countQuestionMarks(decision.question) > 1) {
          throw new Error('AI 返回的 question 含多个问号（复合式连环问）');
        }
      },
    });
  }

  /**
   * 反问环节：以面试官人设回应候选人的提问，并判断是否继续反问
   */
  async generateReverseResponse(
    params: GenerateReverseResponseParams,
  ): Promise<InterviewReverseResponse> {
    return invokeStructuredChain<InterviewReverseResponse>(this.aiService, {
      promptTemplate: interviewReversePrompt,
      llm: this.aiService.generateInterviewQuestion(),
      schema: InterviewReverseResponseSchema,
      variables: {
        ...this.chainVariables(params),
        reverse_count: String(params.reverseCount),
        max_reverse: String(MAX_REVERSE_QUESTIONS),
        conversation_history:
          formatConversationHistory(params.messages) || '（尚无对话记录）',
      },
      label: '反问回应',
      validate: (result) => {
        if (!(result as InterviewReverseResponse)?.response?.trim()) {
          throw new Error('AI 返回的反问回应为空');
        }
      },
    });
  }

  /**
   * 反问建议：按轮次与面试官角色推荐可直接使用的反问策略与话术
   */
  async generateReverseSuggestions(
    params: GenerateReverseSuggestionsParams,
  ): Promise<InterviewReverseSuggestion[]> {
    const result = await invokeStructuredChain<{
      suggestions: InterviewReverseSuggestion[];
    }>(this.aiService, {
      promptTemplate: interviewReverseSuggestionsPrompt,
      llm: this.aiService.generateInterviewSuggestions(),
      schema: InterviewReverseSuggestionsSchema,
      variables: {
        ...this.chainVariables(params),
        suggestion_count: String(REVERSE_SUGGESTIONS_MAX),
        conversation_history:
          formatConversationHistory(params.messages) || '（面试尚未开始）',
      },
      label: '反问建议生成',
      validate: (result) => {
        if (!(result as { suggestions?: unknown[] })?.suggestions?.length) {
          throw new Error('AI 返回的反问建议为空');
        }
      },
    });
    return result.suggestions;
  }

  /**
   * 四类出题链共享的提示词变量：JD/简历上下文与面试官人设
   *
   * 简历输入按预算截断（长简历与长 JD 是所有链的共同上游），
   * 人设变量与报告链同源（buildPersonaVariables）。
   */
  private chainVariables(params: {
    resume: Record<string, any>;
    jobDescription: string;
    levelConfig: ResolvedLevelConfig;
  }): Record<string, string> {
    const { resumeContent, jobDescription } = buildTruncatedAnalysisContext(
      params.resume,
      params.jobDescription,
      ANALYSIS_INPUT_BUDGET,
    );
    return {
      jd: jobDescription,
      resume_content: resumeContent,
      ...buildPersonaVariables(params.levelConfig),
    };
  }
}

/**
 * 按结束政策生成注入提示词的说明文字，
 * 让模型明确知道自己当前是否有结束主体考察的权限
 *
 * 阈值一律从 level.constants 取值（与 resolveEndPolicy 同源）：
 * 文案里写死数字会在常量调整后与服务端实际政策分叉，
 * 让模型按过期的规则决定是否收尾。
 */
function formatEndPolicyDesc(
  policy: EndPolicy,
  elapsedMinutes: number,
  askedCount: number,
): string {
  const minMinutes = MIN_MAIN_DURATION_MS / 60_000;
  switch (policy) {
    case 'must_end':
      return `必须结束：面试已进行 ${elapsedMinutes} 分钟，达到时长上限，现在必须输出自然收尾语并引导候选人反问（shouldEndMainPhase=true）`;
    case 'can_end':
      return `可以结束：面试已进行 ${elapsedMinutes} 分钟、已提问 ${askedCount} 个问题，你可以根据候选人整体表现与主题覆盖情况，决定是否进入结束环节`;
    default:
      return `禁止结束：面试进行 ${elapsedMinutes} 分钟、已提问 ${askedCount} 个问题，尚未同时满足「满 ${minMinutes} 分钟」与「超过 ${SOFT_MAX_MAIN_QUESTIONS} 题」的收尾条件，必须继续出题（shouldEndMainPhase=false）；唯一例外：候选人明确要求终止/放弃本次面试时，按候选人意愿输出告别语并置 userRequestedEnd=true`;
  }
}

/**
 * 归一化大纲主题的题型标注：
 * - 第一个主题强制为自我介绍（每场面试的固定开场）
 * - AI 漏标时默认按项目深挖处理（项目是主体考察的绝对主线）
 * - 反问不作为大纲主题（由会话 phase 驱动）
 */
function normalizeOutlineTopics(
  topics: InterviewOutlineTopic[],
): InterviewOutlineTopic[] {
  return topics.map((topic, index) => {
    const questionType = Object.values(QuestionTypeEnum).includes(
      topic.questionType as QuestionTypeEnum,
    )
      ? topic.questionType
      : QuestionTypeEnum.Project;
    if (index === 0) {
      return { ...topic, questionType: QuestionTypeEnum.SelfIntro };
    }
    return {
      ...topic,
      questionType:
        questionType === QuestionTypeEnum.Reverse
          ? QuestionTypeEnum.Project
          : questionType,
    };
  });
}

/**
 * 统计文本中的问号数量（中英文均计），剔除 ?. 与 ?? 运算符，
 * 避免 Optional Chaining / 空值合并等技术名词被误判为连环问
 */
function countQuestionMarks(text: string): number {
  const withoutOperators = text.replace(/\?\./g, '').replace(/\?\?/g, '');
  return (withoutOperators.match(/[?？]/g) ?? []).length;
}
