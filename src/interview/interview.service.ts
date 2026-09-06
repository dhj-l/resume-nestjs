import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable } from 'rxjs';
import { Resume } from 'src/resume/entities/resume.entity';
import {
  INACTIVITY_TIMEOUT_MS,
  InterviewEndedReasonEnum,
  InterviewPhaseEnum,
  InterviewStatusEnum,
  MAX_REVERSE_QUESTIONS,
  OUTLINE_FILL_TIMEOUT_MS,
  QuestionTypeEnum,
} from './constants/level.constants';
import {
  buildIntroQuestion,
  buildReverseIntroTemplate,
} from './constants/interview-templates';
import {
  CreateInterviewSessionDto,
  SubmitAnswerDto,
} from './dto/create-interview-session.dto';
import { ListInterviewSessionsDto } from './dto/list-interview-sessions.dto';
import {
  InterviewMessage,
  MessageChannelEnum,
  MessageKindEnum,
  MessageRoleEnum,
} from './entities/interview-session.entity';
import {
  InterviewSession,
  InterviewSessionDocument,
} from './entities/interview-session.entity';
import { InterviewTtsCache } from './entities/interview-tts-cache.entity';
import { validateJobDescriptionText } from './utils/job-description.validator';
import {
  normalizeLevelConfig,
  resolveEndPolicy,
  resolveStageConfig,
} from './utils/stage-compat';
import { QuestionEngineService } from './services/question-engine.service';
import { EvaluationService } from './services/evaluation.service';
import type { AnswerFeedbackResult } from './schemas/interview-question.schema';
import {
  TtsAudio,
  TtsService,
  TtsStream,
  TTS_PCM_CHANNELS,
  pcm16ToWav,
} from 'src/ai/tts.service';

/**
 * 提交回答后的结果：逐题反馈 + 下一句话（下一题/反问引导/面试官回应），或面试已结束
 */
export interface SubmitAnswerResult {
  finished: boolean;
  endedReason?: InterviewEndedReasonEnum;
  /** 逐题即时反馈（主体考察阶段每次答题后返回） */
  feedback?: AnswerFeedbackResult;
  nextQuestion?: string;
  round?: number;
  /** 当前会话阶段（main 主体考察 / reverse 反问环节） */
  phase?: InterviewPhaseEnum;
  /** 主体阶段已进行分钟数 */
  elapsedMinutes?: number;
  /** 累计已问题数（含本次） */
  askedCount?: number;
  /** 面试结束时的面试官告别语（反问环节自然收尾时返回） */
  farewell?: string;
}

@Injectable()
export class InterviewService {
  private readonly logger = new Logger(InterviewService.name);

  constructor(
    @InjectModel(InterviewSession.name)
    private readonly sessionModel: Model<InterviewSessionDocument>,
    @InjectModel(Resume.name)
    private readonly resumeModel: Model<any>,
    @InjectModel(InterviewTtsCache.name)
    private readonly ttsCacheModel: Model<any>,
    private readonly questionEngine: QuestionEngineService,
    private readonly evaluationService: EvaluationService,
    private readonly ttsService: TtsService,
  ) {}

  /**
   * 创建面试会话：校验 → 占位落库 → 大纲 → 首题回填
   *
   * 占位会话先落库（partial unique index 即时去重并发双击），
   * AI 生成大纲成功后回填；首题为本地模板的自我介绍引导，不再调用 AI。
   * 占位只授予 OUTLINE_FILL_TIMEOUT_MS 的过期窗口：生成失败时删除占位
   * 释放名额，进程崩溃/发布重启的残留占位到期后由下方过期检查自动关闭，
   * 不会按完整不活动窗口阻塞新建面试。
   */
  async createSession(
    dto: CreateInterviewSessionDto,
    userId: string,
  ): Promise<InterviewSession> {
    const jdCheck = validateJobDescriptionText(dto.jobDescription);
    if (!jdCheck.isValid) {
      throw new BadRequestException(jdCheck.reason);
    }

    const resume = await this.resumeModel
      .findOne({ _id: dto.resumeId, userId })
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }

    const existing = await this.sessionModel.findOne({
      userId: toObjectId(userId),
      status: InterviewStatusEnum.InProgress,
    });
    if (existing) {
      if (this.isExpired(existing)) {
        // 不活动窗口已过（含崩溃残留的占位会话）：自动关闭释放名额
        await this.closeAsTimeout(existing);
      } else {
        throw new ConflictException(
          '您已有一个进行中的面试会话，请先完成或中断',
        );
      }
    }

    // 校招/社招 + 轮次归一化（校招强制 junior，社招拒绝 junior）
    const levelConfig = normalizeLevelConfig(dto.levelConfig);
    const now = new Date();
    let reserved: InterviewSessionDocument;
    try {
      reserved = await this.sessionModel.create({
        userId: toObjectId(userId),
        resumeId: toObjectId(dto.resumeId),
        jobDescription: dto.jobDescription,
        levelConfig,
        currentRound: 1,
        phase: InterviewPhaseEnum.Main,
        messages: [],
        askedTopicKeys: [],
        lastActivityAt: now,
        expiresAt: new Date(now.getTime() + OUTLINE_FILL_TIMEOUT_MS),
      });
    } catch (error: any) {
      // 并发创建时由 partial unique index 兜底
      if (error?.code === 11000) {
        throw new ConflictException(
          '您已有一个进行中的面试会话，请先完成或中断',
        );
      }
      throw error;
    }

    try {
      const outline = await this.questionEngine.generateOutline({
        jobDescription: dto.jobDescription,
        resume,
        levelConfig,
      });
      // 首题为本地模板的自我介绍引导（大纲第一个主题固定为 self_intro）
      const introMessage = buildInterviewerMessage(
        buildIntroQuestion(levelConfig.stage, levelConfig.mode),
        1,
        QuestionTypeEnum.SelfIntro,
      );
      const filled = await this.sessionModel.findByIdAndUpdate(
        reserved._id,
        {
          $set: {
            outline,
            askedTopicKeys: [outline[0].key],
            messages: [introMessage],
            // 大纲回填成功，刷新为完整的不活动窗口
            expiresAt: computeExpiresAt(new Date()),
          },
        },
        { new: true },
      );
      return filled as InterviewSession;
    } catch (error) {
      // AI 生成失败：删除占位会话，释放单会话名额供用户立即重试
      await this.sessionModel.deleteOne({
        _id: reserved._id,
        status: InterviewStatusEnum.InProgress,
      });
      throw error;
    }
  }

  /**
   * 获取当前用户的进行中会话；若已超时则自动关闭后返回该会话
   */
  async getCurrentSession(userId: string): Promise<InterviewSession | null> {
    const session = await this.sessionModel.findOne({
      userId: toObjectId(userId),
      status: InterviewStatusEnum.InProgress,
    });
    if (!session) {
      return null;
    }
    if (this.isExpired(session)) {
      await this.closeAsTimeout(session);
      return session;
    }
    return session;
  }

  /**
   * 分页获取当前用户的面试记录列表
   * 列表项不含对话历史与报告正文（大字段），以 hasReport 标记是否已有报告
   */
  async listSessions(userId: string, query: ListInterviewSessionsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 10;

    const filter: Record<string, any> = { userId: toObjectId(userId) };
    if (query.status) {
      filter.status = query.status;
    }

    const [list, total] = await Promise.all([
      this.sessionModel
        .find(filter)
        .select('-messages -report')
        .sort({ startedAt: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      this.sessionModel.countDocuments(filter),
    ]);

    return {
      list: (list as InterviewSession[]).map((item) => ({
        ...item,
        hasReport: item.status === InterviewStatusEnum.Completed,
      })),
      total,
      page,
      pageSize,
    };
  }

  /**
   * 会话详情（校验归属）
   */
  async getSessionDetail(
    sessionId: string,
    userId: string,
  ): Promise<InterviewSession> {
    const session = await this.findOwnedSession(sessionId, userId);
    if (
      session.status === InterviewStatusEnum.InProgress &&
      this.isExpired(session)
    ) {
      await this.closeAsTimeout(session);
    }
    return session;
  }

  /**
   * 提交回答：按会话阶段分流
   *
   * - 主体考察（main）：回合决策产出逐题反馈 + 下一题，
   *   并按「时长驱动」的结束政策决定是否转入反问环节
   * - 反问环节（reverse）：面试官回应候选人提问，反问上限内可多轮，
   *   结束后自动生成报告
   *
   * 所有关键写入都带 (status, currentRound) 前置条件：读取后若轮次被并发
   * 请求推进或会话已被收尾，更新不生效并返回 409，杜绝重复出题、
   * askedTopicKeys 混入多主题、把下一题写进已完成会话等竞态后果。
   */
  async submitAnswer(
    sessionId: string,
    dto: SubmitAnswerDto,
    userId: string,
    onProgress?: SubmitProgressListener,
  ): Promise<SubmitAnswerResult> {
    const session = await this.requireActiveSession(sessionId, userId);
    const stageConfig = resolveStageConfig(session.levelConfig);

    if (session.phase === InterviewPhaseEnum.Reverse) {
      return this.submitReverseTurn(
        session,
        dto,
        userId,
        stageConfig,
        onProgress,
      );
    }
    return this.submitMainTurn(session, dto, userId, stageConfig, onProgress);
  }

  /**
   * 获取反问环节的推荐话术
   *
   * 按面试轮次、面试官角色、JD 与已聊内容生成 3~5 条可直接使用的反问，
   * 面试进行中与结束后均可调用（结束后用于复盘学习）。
   */
  async getReverseSuggestions(sessionId: string, userId: string) {
    const session = await this.findOwnedSession(sessionId, userId);
    const resume = await this.loadResume(session.resumeId.toString(), userId);
    return this.questionEngine.generateReverseSuggestions({
      jobDescription: session.jobDescription,
      resume,
      levelConfig: resolveStageConfig(session.levelConfig),
      messages: session.messages ?? [],
    });
  }

  /**
   * 主体考察阶段：一次回合决策 = 逐题反馈 + 下一动作
   */
  private async submitMainTurn(
    session: InterviewSessionDocument,
    dto: SubmitAnswerDto,
    userId: string,
    stageConfig: ReturnType<typeof resolveStageConfig>,
    onProgress?: SubmitProgressListener,
  ): Promise<SubmitAnswerResult> {
    const currentRound = session.currentRound;
    await this.appendCandidateMessage(session, dto);

    // 时长驱动的结束政策：不足 30 分钟禁止收尾；满 60 分钟强制收尾；
    // 满 30 分钟且超过题数软上限后交给 AI 根据候选人表现判断
    const elapsedMs = Date.now() - session.startedAt.getTime();
    const elapsedMinutes = Math.max(0, Math.floor(elapsedMs / 60_000));
    const askedCount = countInterviewerQuestions(session.messages);
    const endPolicy = resolveEndPolicy(elapsedMs, askedCount);

    const turn = await this.questionEngine.generateTurn({
      jobDescription: session.jobDescription,
      resume: await this.loadResume(session.resumeId.toString(), userId),
      levelConfig: stageConfig,
      outline: session.outline ?? [],
      messages: session.messages,
      askedTopicKeys: session.askedTopicKeys ?? [],
      elapsedMinutes,
      askedCount,
      endPolicy,
    });

    await this.writeFeedback(
      session,
      currentRound,
      dto.content.trim(),
      turn.feedback,
    );

    // 候选人明确要求终止面试：无视结束政策与时长规则，以 AI 告别语直接
    // 收尾出报告（user_finish），不再进入反问环节——现实中候选人说
    // 「我有急事得走」时，面试官道别后面试就结束了
    if (turn.userRequestedEnd === true) {
      const farewellRound = await this.appendInterviewerMessage(
        session,
        turn.question,
        QuestionTypeEnum.Reverse,
      );
      onProgress?.({
        type: 'closing',
        data: {
          farewell: turn.question,
          round: farewellRound,
          phase: InterviewPhaseEnum.Main,
        } satisfies ClosingEventPayload,
      });
      return this.completeWithReport(
        session,
        InterviewEndedReasonEnum.UserFinish,
        turn.question,
      );
    }

    const shouldTransition =
      endPolicy === 'must_end' ||
      (endPolicy === 'can_end' && turn.shouldEndMainPhase === true);
    if (shouldTransition) {
      // AI 已按约定输出收尾引导语时使用；否则本地模板兜底，保证反问必然开启
      const closing =
        turn.shouldEndMainPhase === true &&
        turn.questionType === QuestionTypeEnum.Reverse
          ? turn.question
          : buildReverseIntroTemplate(stageConfig.stage);
      return this.enterReversePhase(session, closing, turn.feedback);
    }

    const nextRound = currentRound + 1;
    const askedTopicKeys = [...(session.askedTopicKeys ?? [])];
    if (turn.topicKey && !askedTopicKeys.includes(turn.topicKey)) {
      askedTopicKeys.push(turn.topicKey);
    }

    const updated = await this.sessionModel.findOneAndUpdate(
      {
        _id: session._id,
        status: InterviewStatusEnum.InProgress,
        currentRound,
      },
      {
        $push: {
          messages: buildInterviewerMessage(
            turn.question,
            nextRound,
            turn.questionType,
          ),
        },
        $set: {
          currentRound: nextRound,
          askedTopicKeys,
          lastActivityAt: new Date(),
          expiresAt: computeExpiresAt(new Date()),
        },
      },
    );
    if (!updated) {
      throw new ConflictException('面试会话状态已变化，请刷新后重试');
    }

    return {
      finished: false,
      feedback: turn.feedback,
      nextQuestion: turn.question,
      round: nextRound,
      phase: InterviewPhaseEnum.Main,
      elapsedMinutes,
      askedCount: askedCount + 1,
    };
  }

  /**
   * 反问环节：面试官回应候选人提问；反问上限或候选人无更多问题时自动收尾出报告
   */
  private async submitReverseTurn(
    session: InterviewSessionDocument,
    dto: SubmitAnswerDto,
    userId: string,
    stageConfig: ReturnType<typeof resolveStageConfig>,
    onProgress?: SubmitProgressListener,
  ): Promise<SubmitAnswerResult> {
    await this.appendCandidateMessage(session, dto);

    const reverseCount = countReverseQuestions(session.messages);
    const decision = await this.questionEngine.generateReverseResponse({
      jobDescription: session.jobDescription,
      resume: await this.loadResume(session.resumeId.toString(), userId),
      levelConfig: stageConfig,
      messages: session.messages,
      reverseCount,
    });

    // 面试官回应总是落库：即使即将收尾，它也是对话记录（与报告）的一部分
    const nextRound = await this.appendInterviewerMessage(
      session,
      decision.response,
      QuestionTypeEnum.Reverse,
    );

    if (!decision.continueReverse || reverseCount >= MAX_REVERSE_QUESTIONS) {
      // 告别回应先于报告生成推送：报告基于长转录 + 思考模式生成，
      // 可能耗时数分钟，不能让用户在静默中等待（实测曾达 4 分钟以上）
      onProgress?.({
        type: 'closing',
        data: {
          farewell: decision.response,
          round: nextRound,
          phase: InterviewPhaseEnum.Reverse,
        } satisfies ClosingEventPayload,
      });
      return this.completeWithReport(
        session,
        InterviewEndedReasonEnum.Completed,
        decision.response,
      );
    }

    return {
      finished: false,
      nextQuestion: decision.response,
      round: nextRound,
      phase: InterviewPhaseEnum.Reverse,
    };
  }

  /**
   * 条件追加候选人消息（带重试检测与轮次前置条件）
   *
   * @returns true 表示本次是上次出题失败后的重试（同轮次同内容已落库，
   *          跳过重复追加，只刷新活跃窗口）
   */
  private async appendCandidateMessage(
    session: InterviewSessionDocument,
    dto: SubmitAnswerDto,
  ): Promise<boolean> {
    const currentRound = session.currentRound;
    const trimmedContent = dto.content.trim();
    const lastMessage = session.messages?.[session.messages.length - 1];
    const isRetryOfSameAnswer =
      !!lastMessage &&
      lastMessage.role === MessageRoleEnum.Candidate &&
      lastMessage.round === currentRound &&
      lastMessage.content === trimmedContent;

    if (isRetryOfSameAnswer) {
      await this.sessionModel.findByIdAndUpdate(session._id, {
        $set: {
          lastActivityAt: new Date(),
          expiresAt: computeExpiresAt(new Date()),
        },
      });
      return true;
    }

    const appended = await this.sessionModel.findOneAndUpdate(
      {
        _id: session._id,
        status: InterviewStatusEnum.InProgress,
        currentRound,
      },
      {
        $push: {
          messages: {
            role: MessageRoleEnum.Candidate,
            content: trimmedContent,
            round: currentRound,
            kind: MessageKindEnum.Answer,
            channel: dto.channel ?? MessageChannelEnum.Text,
            // 反问环节候选人消息标注 reverse，用于计数与报告分组
            ...(session.phase === InterviewPhaseEnum.Reverse
              ? { questionType: QuestionTypeEnum.Reverse }
              : {}),
          },
        },
        $set: {
          lastActivityAt: new Date(),
          expiresAt: computeExpiresAt(new Date()),
        },
      },
    );
    if (!appended) {
      throw new ConflictException('面试会话状态已变化，请刷新后重试');
    }
    session.messages.push({
      role: MessageRoleEnum.Candidate,
      content: trimmedContent,
      round: currentRound,
      kind: MessageKindEnum.Answer,
      channel: dto.channel ?? MessageChannelEnum.Text,
      ...(session.phase === InterviewPhaseEnum.Reverse
        ? { questionType: QuestionTypeEnum.Reverse }
        : {}),
    } as InterviewMessage);
    return false;
  }

  /**
   * 条件追加面试官消息（轮次前置条件防竞态），写入后同步进内存转录
   * 供后续报告/收尾逻辑使用，返回新一轮次号
   */
  private async appendInterviewerMessage(
    session: InterviewSessionDocument,
    content: string,
    questionType?: QuestionTypeEnum,
  ): Promise<number> {
    const currentRound = session.currentRound;
    const nextRound = currentRound + 1;
    const updated = await this.sessionModel.findOneAndUpdate(
      {
        _id: session._id,
        status: InterviewStatusEnum.InProgress,
        currentRound,
      },
      {
        $push: {
          messages: buildInterviewerMessage(content, nextRound, questionType),
        },
        $set: {
          currentRound: nextRound,
          lastActivityAt: new Date(),
          expiresAt: computeExpiresAt(new Date()),
        },
      },
    );
    if (!updated) {
      throw new ConflictException('面试会话状态已变化，请刷新后重试');
    }
    session.messages.push(
      buildInterviewerMessage(
        content,
        nextRound,
        questionType,
      ) as InterviewMessage,
    );
    return nextRound;
  }

  /**
   * 将逐题反馈回写到本轮被评估的那条候选人消息上（arrayFilters 精确定位）。
   *
   * 上次出题失败后换答案重试时，同轮会累积多条候选人消息，
   * 反馈只应落在刚被评估的一条上，因此除 role/round 外再按内容匹配
   * （与 appendCandidateMessage 的去重判定同源，均为 trim 后的内容）。
   * 反馈已随响应返回给用户，落库失败不阻断答题流程，仅记 warn。
   */
  private async writeFeedback(
    session: InterviewSessionDocument,
    round: number,
    answerContent: string,
    feedback: AnswerFeedbackResult,
  ): Promise<void> {
    try {
      await this.sessionModel.updateOne(
        { _id: session._id },
        { $set: { 'messages.$[msg].feedback': feedback } },
        {
          arrayFilters: [
            {
              'msg.role': MessageRoleEnum.Candidate,
              'msg.round': round,
              'msg.content': answerContent,
            },
          ],
        },
      );
    } catch (error) {
      this.logger.warn(
        `逐题反馈落库失败（session=${session._id} round=${round}）`,
        (error as Error).message,
      );
    }
  }

  /**
   * 主体考察结束，进入反问环节：写入收尾引导语并切换 phase
   */
  private async enterReversePhase(
    session: InterviewSessionDocument,
    closingQuestion: string,
    feedback?: AnswerFeedbackResult,
  ): Promise<SubmitAnswerResult> {
    const nextRound = session.currentRound + 1;
    const updated = await this.sessionModel.findOneAndUpdate(
      {
        _id: session._id,
        status: InterviewStatusEnum.InProgress,
        currentRound: session.currentRound,
      },
      {
        $push: {
          messages: buildInterviewerMessage(
            closingQuestion,
            nextRound,
            QuestionTypeEnum.Reverse,
          ),
        },
        $set: {
          currentRound: nextRound,
          phase: InterviewPhaseEnum.Reverse,
          lastActivityAt: new Date(),
          expiresAt: computeExpiresAt(new Date()),
        },
      },
    );
    if (!updated) {
      throw new ConflictException('面试会话状态已变化，请刷新后重试');
    }

    return {
      finished: false,
      feedback,
      nextQuestion: closingQuestion,
      round: nextRound,
      phase: InterviewPhaseEnum.Reverse,
    };
  }

  /**
   * 用户主动收尾：立即生成评价报告
   */
  async finishSession(
    sessionId: string,
    userId: string,
  ): Promise<InterviewSession> {
    const session = await this.requireActiveSession(sessionId, userId);
    return this.completeAndSave(session, InterviewEndedReasonEnum.UserFinish);
  }

  /**
   * 用户强制中断：不出报告、不调 AI，直接关闭释放单会话名额
   */
  async cancelSession(
    sessionId: string,
    userId: string,
  ): Promise<InterviewSession> {
    const session = await this.requireActiveSession(sessionId, userId);
    const updated = await this.sessionModel
      .findOneAndUpdate(
        { _id: session._id, status: InterviewStatusEnum.InProgress },
        {
          $set: {
            status: InterviewStatusEnum.Cancelled,
            endedReason: InterviewEndedReasonEnum.UserCancel,
            endedAt: new Date(),
            lastActivityAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
    if (!updated) {
      throw new ConflictException('该面试会话已结束');
    }
    return updated as InterviewSession;
  }

  /**
   * 获取评价报告
   */
  async getReport(sessionId: string, userId: string) {
    const session = await this.findOwnedSession(sessionId, userId);
    if (!session.report) {
      throw new BadRequestException('该面试尚未生成评价报告');
    }
    return session.report;
  }

  /**
   * 获取指定轮次面试官问题的语音（wav）
   *
   * 按 round 从会话消息中取回面试官提问文本，不透传任意文本；
   * 会话已结束（回放）同样可用。
   * 合成结果按 (sessionId, round) 落库缓存 30 天，重复点播不再调用 TTS。
   * 缓存规范格式为原始 PCM16（audio/pcm），返回前本地封装 wav。
   */
  async getQuestionAudio(
    sessionId: string,
    userId: string,
    round: number,
  ): Promise<TtsAudio> {
    const content = await this.resolveQuestionContent(sessionId, userId, round);

    const cached = await this.readTtsCache(sessionId, round);
    if (cached) {
      return {
        buffer: pcm16ToWav(cached.audio, {
          sampleRate: cached.sampleRate,
          channels: TTS_PCM_CHANNELS,
        }),
        mimeType: 'audio/wav',
      };
    }

    const handle = await this.ttsService.synthesizeStream(content);
    const chunks: Buffer[] = [];
    try {
      for await (const chunk of handle.iterator) {
        chunks.push(chunk);
      }
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error('TTS 流式合成异常', (error as Error).stack);
      throw new InternalServerErrorException('语音合成失败，请稍后重试');
    }
    const pcm = Buffer.concat(chunks);
    await this.writeTtsCache(
      sessionId,
      round,
      content,
      pcm,
      handle.meta.sampleRate,
    );
    return {
      buffer: pcm16ToWav(pcm, handle.meta),
      mimeType: 'audio/wav',
    };
  }

  /**
   * 获取指定轮次面试官问题的流式语音事件（供 SSE 协议层使用）
   *
   * 事件序列：`meta`（采样率等元信息）→ `chunk`（base64 PCM16）×N → `done`；
   * 上游/合成失败时在流内发 `error` 事件后结束。
   * 同步错误（会话不存在、round 无问题）在此方法内直接抛出，
   * 调用方在设置 SSE 头之前处理，保证以标准 JSON 错误包络返回；
   * 上游建连与合成推迟到订阅时才发生，客户端在等待期断开则零合成成本。
   * 客户端断开 → 取消订阅并终止上游请求（不再产生费用）。
   */
  async getQuestionAudioStreamEvents(
    sessionId: string,
    userId: string,
    round: number,
  ): Promise<Observable<TtsStreamEvent>> {
    const content = await this.resolveQuestionContent(sessionId, userId, round);

    // 缓存命中：不发上游请求，快速重放已合成的 PCM
    const cached = await this.readTtsCache(sessionId, round);
    if (cached) {
      return this.replayCachedAudio(cached.audio, cached.sampleRate);
    }

    return new Observable<TtsStreamEvent>((subscriber) => {
      let handle: TtsStream | null = null;
      void (async () => {
        const chunks: Buffer[] = [];
        try {
          // 订阅时才建连：等待期客户端断开时根本不发起合成
          handle = await this.ttsService.synthesizeStream(content);
          if (subscriber.closed) {
            // 建连 await 期间订阅者已取消：teardown 已执行过（当时 handle
            // 还是 null），句柄必须在此立即中止，否则上游请求泄漏
            handle.abort();
            return;
          }
          this.emitIfOpen(subscriber, {
            type: 'meta',
            sampleRate: handle.meta.sampleRate,
            channels: handle.meta.channels,
          });
          for await (const pcm of handle.iterator) {
            if (subscriber.closed) {
              handle.abort();
              return;
            }
            chunks.push(pcm);
            this.emitIfOpen(subscriber, {
              type: 'chunk',
              data: pcm.toString('base64'),
            });
          }
          this.emitIfOpen(subscriber, { type: 'done' });
          // 侧路缓存：结果落库供下次重放，不影响本次播放
          void this.writeTtsCache(
            sessionId,
            round,
            content,
            Buffer.concat(chunks),
            handle.meta.sampleRate,
          );
        } catch (error) {
          this.logger.error('TTS 流式合成异常', (error as Error).stack);
          this.emitIfOpen(subscriber, {
            type: 'error',
            message:
              error instanceof HttpException
                ? error.message
                : '语音合成失败，请稍后重试',
          });
        } finally {
          if (!subscriber.closed) {
            subscriber.complete();
          }
        }
      })();
      // 客户端断开时立即终止上游请求；上游挂起时循环卡在等待下一块，
      // 仅靠循环内的 closed 检查永远轮不到 abort
      return () => handle?.abort();
    });
  }

  /** 从缓存 PCM 构造重放事件流（约 8KB/帧 ≈ 0.17s @24kHz） */
  private replayCachedAudio(
    audio: Buffer,
    sampleRate: number,
  ): Observable<TtsStreamEvent> {
    return new Observable<TtsStreamEvent>((subscriber) => {
      try {
        this.emitIfOpen(subscriber, {
          type: 'meta',
          sampleRate,
          channels: TTS_PCM_CHANNELS,
        });
        const FRAME_BYTES = 8192;
        for (let offset = 0; offset < audio.length; offset += FRAME_BYTES) {
          if (subscriber.closed) {
            return;
          }
          this.emitIfOpen(subscriber, {
            type: 'chunk',
            data: audio
              .subarray(offset, Math.min(offset + FRAME_BYTES, audio.length))
              .toString('base64'),
          });
        }
        this.emitIfOpen(subscriber, { type: 'done' });
      } finally {
        if (!subscriber.closed) {
          subscriber.complete();
        }
      }
    });
  }

  private emitIfOpen(
    subscriber: { closed: boolean; next: (event: TtsStreamEvent) => void },
    event: TtsStreamEvent,
  ): void {
    if (!subscriber.closed) {
      subscriber.next(event);
    }
  }

  /**
   * 取回指定轮次面试官提问文本（会话归属校验 + round 校验）
   */
  private async resolveQuestionContent(
    sessionId: string,
    userId: string,
    round: number,
  ): Promise<string> {
    const session = await this.findOwnedSession(sessionId, userId);
    const question = session.messages?.find(
      (message) =>
        message.role === MessageRoleEnum.Interviewer &&
        message.kind === MessageKindEnum.Question &&
        message.round === round,
    );
    if (!question?.content) {
      throw new BadRequestException('该轮次的问题不存在');
    }
    return question.content;
  }

  /** 读取有效缓存：仅命中 audio/pcm 且有采样率的文档；历史 wav 缓存视为失效 */
  private async readTtsCache(
    sessionId: string,
    round: number,
  ): Promise<{ audio: Buffer; sampleRate: number } | null> {
    const cached = await this.ttsCacheModel
      .findOne({ sessionId: toObjectId(sessionId), round })
      .lean<{
        audio: Buffer;
        mimeType: string;
        sampleRate?: number;
      } | null>();
    if (
      !cached?.audio ||
      cached.mimeType !== 'audio/pcm' ||
      !cached.sampleRate
    ) {
      return null;
    }
    // Mongoose 9 + bson 7：lean() 对 Buffer 字段返回 BSON Binary（length 是
    // 方法、无 subarray），直接用会让 wav 封装与重放循环全部失灵，
    // 统一归一化为 Node Buffer
    const raw = cached.audio as
      | Buffer
      | { value?: () => Buffer; buffer?: Buffer };
    const audio = Buffer.isBuffer(raw)
      ? raw
      : Buffer.from(
          typeof raw.value === 'function' ? raw.value() : (raw.buffer ?? []),
        );
    if (!audio.length) {
      this.logger.warn(
        `TTS 缓存命中但音频为空（session=${sessionId} round=${round}），视为失效重新合成`,
      );
      return null;
    }
    return { audio, sampleRate: cached.sampleRate };
  }

  /** 落库缓存（raw PCM + 采样率）；内部吞掉写入异常，只留 warn */
  private async writeTtsCache(
    sessionId: string,
    round: number,
    text: string,
    audio: Buffer,
    sampleRate: number,
  ): Promise<void> {
    try {
      await this.ttsCacheModel.updateOne(
        { sessionId: toObjectId(sessionId), round },
        {
          $set: {
            sessionId: toObjectId(sessionId),
            round,
            text,
            audio,
            mimeType: 'audio/pcm',
            sampleRate,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      // 缓存写失败不影响本次播放，下次点播重新合成
      this.logger.warn('TTS 缓存落库失败', (error as Error).message);
    }
  }

  /**
   * 提交回答的 SSE 流式变体：传输层增强，与 submitAnswer 共用核心逻辑
   *
   * 事件序列：init → feedback（逐题反馈，如有）→ question / finished；
   * 反问收尾时额外先推 closing（面试官告别语，报告生成前的即时反馈）；
   * 与 TTS 流同模式：处理在订阅时才开始，init 不会在订阅前丢帧；
   * 为后续语音场景 TTS 消费文本流预留。
   */
  async submitAnswerSse(
    sessionId: string,
    dto: SubmitAnswerDto,
    userId: string,
  ): Promise<Observable<SseEvent>> {
    // 校验前置：会话不存在/已结束/超时在返回流之前抛出，
    // 控制器在设置 SSE 头之前即可捕获，保证以标准 JSON 错误包络返回（404/409）
    await this.requireActiveSession(sessionId, userId);
    return new Observable<SseEvent>((subscriber) => {
      void (async () => {
        try {
          subscriber.next({ type: 'init', message: '开始处理回答' });
          const result = await this.submitAnswer(
            sessionId,
            dto,
            userId,
            (event) => {
              if (!subscriber.closed) {
                subscriber.next(event);
              }
            },
          );
          if (result.feedback) {
            // 先推反馈再推下一题，前端可先渲染点评再等待新问题
            subscriber.next({ type: 'feedback', data: result.feedback });
          }
          subscriber.next({
            type: result.finished ? 'finished' : 'question',
            data: result,
          });
          subscriber.complete();
        } catch (error: any) {
          subscriber.error(error);
        }
      })();
    });
  }

  // ---------- 内部工具 ----------

  private async findOwnedSession(
    sessionId: string,
    userId: string,
  ): Promise<InterviewSessionDocument> {
    if (!Types.ObjectId.isValid(sessionId)) {
      throw new BadRequestException('会话 ID 格式不正确');
    }
    const session = await this.sessionModel.findOne({
      _id: sessionId,
      userId: toObjectId(userId),
    });
    if (!session) {
      throw new NotFoundException('面试会话不存在');
    }
    return session;
  }

  /**
   * 惰性超时检查 + 活跃会话获取
   */
  private async requireActiveSession(
    sessionId: string,
    userId: string,
  ): Promise<InterviewSessionDocument> {
    const session = await this.findOwnedSession(sessionId, userId);

    if (session.status !== InterviewStatusEnum.InProgress) {
      throw new ConflictException('该面试会话已结束');
    }
    if (this.isExpired(session)) {
      await this.closeAsTimeout(session);
      throw new ConflictException(
        '面试会话因长时间无回复已自动结束，请重新发起面试',
      );
    }
    return session;
  }

  private isExpired(session: InterviewSessionDocument): boolean {
    return !!session.expiresAt && session.expiresAt.getTime() <= Date.now();
  }

  private async closeAsTimeout(session: InterviewSessionDocument) {
    await this.sessionModel.findByIdAndUpdate(session._id, {
      $set: {
        status: InterviewStatusEnum.Cancelled,
        endedReason: InterviewEndedReasonEnum.Timeout,
        endedAt: new Date(),
        lastActivityAt: new Date(),
      },
    });
    session.status = InterviewStatusEnum.Cancelled;
    session.endedReason = InterviewEndedReasonEnum.Timeout;
    this.logger.warn(`面试会话 ${session._id} 因超时被关闭`);
  }

  private async completeWithReport(
    session: InterviewSessionDocument,
    endedReason: InterviewEndedReasonEnum,
    farewell?: string,
  ): Promise<SubmitAnswerResult> {
    await this.completeAndSave(session, endedReason);
    return {
      finished: true,
      endedReason,
      phase: session.phase,
      farewell,
    };
  }

  private async completeAndSave(
    session: InterviewSessionDocument,
    endedReason: InterviewEndedReasonEnum,
  ): Promise<InterviewSession> {
    const durationMinutes = Math.max(
      0,
      Math.round((Date.now() - session.startedAt.getTime()) / 60_000),
    );
    const report = await this.evaluationService.generateReport({
      jobDescription: session.jobDescription,
      levelConfig: resolveStageConfig(session.levelConfig),
      outline: session.outline ?? [],
      messages: session.messages,
      durationMinutes,
      questionCount: countInterviewerQuestions(session.messages),
    });

    // 以 status 为前置条件收尾：与并发 submitAnswer/finishSession 竞争时
    // 只有一个赢家，避免把完成态写进已被关闭的会话
    const updated = await this.sessionModel
      .findOneAndUpdate(
        { _id: session._id, status: InterviewStatusEnum.InProgress },
        {
          $set: {
            status: InterviewStatusEnum.Completed,
            endedReason,
            endedAt: new Date(),
            report,
            lastActivityAt: new Date(),
          },
        },
        { new: true },
      )
      .lean();
    if (!updated) {
      throw new ConflictException('该面试会话已结束');
    }
    return updated as InterviewSession;
  }

  private async loadResume(resumeId: string, userId: string) {
    const resume = await this.resumeModel
      .findOne({ _id: resumeId, userId })
      .lean();
    if (!resume) {
      throw new BadRequestException('简历不存在');
    }
    return resume;
  }
}

function buildInterviewerMessage(
  content: string,
  round: number,
  questionType?: QuestionTypeEnum,
) {
  return {
    role: MessageRoleEnum.Interviewer,
    content,
    round,
    kind: MessageKindEnum.Question,
    channel: MessageChannelEnum.Text,
    questionType,
    askedAt: new Date(),
  };
}

/** 累计已提问的面试官问题数（含自我介绍与反问引导） */
function countInterviewerQuestions(messages: InterviewMessage[]): number {
  return (messages ?? []).filter(
    (message) =>
      message.role === MessageRoleEnum.Interviewer &&
      message.kind === MessageKindEnum.Question,
  ).length;
}

/** 候选人已反问次数（反问环节候选人消息标注 questionType=reverse） */
function countReverseQuestions(messages: InterviewMessage[]): number {
  return (messages ?? []).filter(
    (message) =>
      message.role === MessageRoleEnum.Candidate &&
      message.questionType === QuestionTypeEnum.Reverse,
  ).length;
}

function computeExpiresAt(from: Date): Date {
  return new Date(from.getTime() + INACTIVITY_TIMEOUT_MS);
}

/**
 * 安全转换 ObjectId：非法字符串原样返回，由 Mongoose 处理
 */
function toObjectId(id: string): Types.ObjectId | string {
  return Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id;
}

/** SSE 事件结构（与 resume-ai 的消息风格保持一致） */
export interface SseEvent {
  type: 'init' | 'feedback' | 'closing' | 'question' | 'finished' | 'error';
  message?: string;
  data?: SubmitAnswerResult | unknown;
}

/** 反问收尾事件载荷：面试官告别回应先于报告生成推送给客户端 */
export interface ClosingEventPayload {
  farewell: string;
  round: number;
  phase: InterviewPhaseEnum;
}

/** 反问收尾等长耗时节点的前置进度回调（SSE 路径透传为事件帧） */
export type SubmitProgressListener = (event: SseEvent) => void;

/**
 * TTS 流式事件（GET /sessions/:id/tts/stream 的 SSE 载荷）
 *
 * 正常序列：meta → chunk ×N → done；异常：在流内发 error 后结束。
 * chunk.data 为 base64 编码的 PCM16（小端 16bit 单声道）原始字节。
 */
export type TtsStreamEvent =
  | { type: 'meta'; sampleRate: number; channels: number }
  | { type: 'chunk'; data: string }
  | { type: 'done' }
  | { type: 'error'; message: string };
