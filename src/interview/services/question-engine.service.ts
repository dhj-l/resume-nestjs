import { Injectable, Logger } from '@nestjs/common';
import { AiService } from 'src/ai/ai.service';
import { formatDate } from 'src/common/utils/date';
import {
  ANALYSIS_INPUT_BUDGET,
  buildTruncatedAnalysisContext,
} from 'src/resume-ai/analysis.utils';
import {
  DEEP_DIVE_QUOTA_BASE,
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
import {
  buildCoverageQuestion,
  remainingOutlineTopics,
} from '../utils/outline-coverage.utils';
import {
  buildProjectDeepDiveQuota,
  buildProjectQuotaFallback,
} from '../utils/project-quota.util';
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
        // 项目深挖配额在代码层按经历时间算好后注入（LLM 自行按百分比
        // 分配不可靠）；收集范围随面试模式变化（校招=项目+实习，
        // 社招=工作+项目），简历无对应经历时注入同源兜底文案
        project_quota:
          buildProjectDeepDiveQuota(
            params.resume,
            DEEP_DIVE_QUOTA_BASE,
            params.levelConfig.mode,
          ) || buildProjectQuotaFallback(params.levelConfig.mode),
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
    const remainingTopics = remainingOutlineTopics(
      params.outline,
      params.askedTopicKeys,
    );

    const decision = await invokeStructuredChain<InterviewTurnDecision>(
      this.aiService,
      {
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
            remainingTopics.length,
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
      },
    );

    return this.enforceCoverageBeforeEnding(decision, remainingTopics);
  }

  /**
   * 覆盖前置条件的兜底修正：仍有未覆盖主题时不允许收尾
   *
   * 提示词已明确「剩余主题非空必须继续出题」，但模型偶发提前置位
   * shouldEndMainPhase。此时若原样交给服务层，收尾语会被当成下一题写入
   * 转录（候选人看到告别语却还要作答），因此这里必须把决策纠正为继续出题：
   * - 模型已给出指向剩余主题的题目：保留题目文本，仅纠正标记（无损）
   * - 收尾语 / 大纲外自主题：替换为推进下一个剩余主题的本地兜底题
   *
   * 服务端的进入反问门禁（shouldEnterReversePhase）以覆盖为前提，
   * 两处判定同源，保证「大纲主题问完才进反问」不被一次模型跑偏破坏。
   */
  private enforceCoverageBeforeEnding(
    decision: InterviewTurnDecision,
    remainingTopics: InterviewOutlineTopic[],
  ): InterviewTurnDecision {
    if (
      !remainingTopics.length ||
      !decision.shouldEndMainPhase ||
      // 候选人主动终止优先级最高，不属于"提前收尾"
      decision.userRequestedEnd === true
    ) {
      return decision;
    }

    const targeted = remainingTopics.find(
      (topic) => topic.key === decision.topicKey,
    );
    if (targeted && decision.questionType !== QuestionTypeEnum.Reverse) {
      this.logger.warn(
        `仍有 ${remainingTopics.length} 个未覆盖主题，已忽略本轮收尾标记（题目仍指向主题 ${targeted.key}）`,
      );
      return { ...decision, shouldEndMainPhase: false };
    }

    const nextTopic = remainingTopics[0];
    this.logger.warn(
      `仍有 ${remainingTopics.length} 个未覆盖主题，AI 输出收尾语已替换为推进主题 ${nextTopic.key} 的兜底题`,
    );
    return {
      ...decision,
      shouldEndMainPhase: false,
      isFollowUp: false,
      topicKey: nextTopic.key,
      questionType:
        nextTopic.questionType === QuestionTypeEnum.Reverse ||
        !nextTopic.questionType
          ? QuestionTypeEnum.Project
          : nextTopic.questionType,
      question: buildCoverageQuestion(nextTopic),
    };
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
 *
 * 覆盖前置条件与 shouldEnterReversePhase 同源：仍有未覆盖主题时，
 * 无论时长/题数政策如何，文案都必须传达「本轮禁止收尾，继续推进剩余主题」，
 * 否则模型会按"面试聊得够久了"提前收尾，导致大纲主题只考察一部分。
 */
function formatEndPolicyDesc(
  policy: EndPolicy,
  elapsedMinutes: number,
  askedCount: number,
  remainingCount: number,
): string {
  const minMinutes = MIN_MAIN_DURATION_MS / 60_000;
  const hasRemaining = remainingCount > 0;
  switch (policy) {
    case 'must_end':
      return hasRemaining
        ? `必须收尾，但大纲覆盖未完成：面试已进行 ${elapsedMinutes} 分钟，已达时长上限，仍有 ${remainingCount} 个主题尚未覆盖——不再追问、不再大纲外自主出题，逐个把剩余主题问完，全部覆盖后立即输出收尾语并引导候选人反问（shouldEndMainPhase=true）`
        : `必须结束：面试已进行 ${elapsedMinutes} 分钟，达到时长上限，且大纲主题已全部覆盖，现在必须输出自然收尾语并引导候选人反问（shouldEndMainPhase=true）`;
    case 'can_end':
      return hasRemaining
        ? `禁止结束：面试已进行 ${elapsedMinutes} 分钟、已提问 ${askedCount} 个问题，但仍有 ${remainingCount} 个大纲主题尚未覆盖——必须继续出题（shouldEndMainPhase=false），优先推进剩余主题，不得因时长或题数而提前收尾；全部覆盖后才可判断是否收尾`
        : `可以结束：面试已进行 ${elapsedMinutes} 分钟、已提问 ${askedCount} 个问题，且大纲主题已全部覆盖，你可以根据候选人整体表现决定是否进入结束环节`;
    default:
      return `禁止结束：面试进行 ${elapsedMinutes} 分钟、已提问 ${askedCount} 个问题，尚未同时满足「满 ${minMinutes} 分钟」与「超过 ${SOFT_MAX_MAIN_QUESTIONS} 题」的收尾条件，必须继续出题（shouldEndMainPhase=false）；唯一例外：候选人明确要求终止/放弃本次面试时，按候选人意愿输出告别语并置 userRequestedEnd=true${
        hasRemaining
          ? `；另有 ${remainingCount} 个大纲主题尚未覆盖，需一并推进`
          : ''
      }`;
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
