import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Observable, Subject } from 'rxjs';
import { Resume } from 'src/resume/entities/resume.entity';
import {
  INACTIVITY_TIMEOUT_MS,
  MIN_ROUNDS_BEFORE_AI_END,
  InterviewEndedReasonEnum,
  InterviewStatusEnum,
} from './constants/level.constants';
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
import { QuestionEngineService } from './services/question-engine.service';
import { EvaluationService } from './services/evaluation.service';
import { TtsAudio, TtsService } from 'src/ai/tts.service';

/**
 * 提交回答后的结果：下一题，或面试已结束并附报告
 */
export interface SubmitAnswerResult {
  finished: boolean;
  endedReason?: InterviewEndedReasonEnum;
  nextQuestion?: string;
  round?: number;
  targetRounds?: number;
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
   * 创建面试会话：校验 → 大纲 → 首题
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
      throw new ConflictException('您已有一个进行中的面试会话，请先完成或中断');
    }

    const outline = await this.questionEngine.generateOutline({
      jobDescription: dto.jobDescription,
      resume,
      levelConfig: dto.levelConfig,
    });
    const targetRounds = this.questionEngine.resolveTargetRounds(
      dto.levelConfig,
    );

    const decision = await this.questionEngine.generateNextQuestion({
      jobDescription: dto.jobDescription,
      resume,
      levelConfig: dto.levelConfig,
      outline,
      messages: [],
      askedTopicKeys: [],
      round: 1,
    });

    const now = new Date();
    try {
      return await this.sessionModel.create({
        userId: toObjectId(userId),
        resumeId: toObjectId(dto.resumeId),
        jobDescription: dto.jobDescription,
        levelConfig: dto.levelConfig,
        targetRounds,
        outline,
        currentRound: 1,
        askedTopicKeys: [decision.topicKey],
        messages: [buildInterviewerMessage(decision.question, 1)],
        lastActivityAt: now,
        expiresAt: computeExpiresAt(now),
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
   * 提交回答：追加候选人消息 → 出题引擎决策 → 返回下一题或结束报告
   *
   * 该方法以纯文本输入输出，不感知传输层；
   * 后续语音面试只需将 ASR 转写文本传入即可复用。
   */
  async submitAnswer(
    sessionId: string,
    dto: SubmitAnswerDto,
    userId: string,
  ): Promise<SubmitAnswerResult> {
    const session = await this.requireActiveSession(sessionId, userId);

    const currentRound = session.currentRound;
    await this.appendCandidateMessage(session, dto);

    // 达到目标轮次：正常收尾出报告
    if (currentRound >= session.targetRounds) {
      return this.completeWithReport(
        session,
        InterviewEndedReasonEnum.Completed,
      );
    }

    const decision = await this.questionEngine.generateNextQuestion({
      jobDescription: session.jobDescription,
      resume: await this.loadResume(session.resumeId.toString(), userId),
      levelConfig: session.levelConfig,
      outline: session.outline ?? [],
      messages: session.messages,
      askedTopicKeys: session.askedTopicKeys ?? [],
      round: currentRound + 1,
    });

    // AI 建议结束且已达最小轮次：提前收尾出报告
    if (
      decision.shouldEndInterview &&
      currentRound >= MIN_ROUNDS_BEFORE_AI_END
    ) {
      return this.completeWithReport(
        session,
        InterviewEndedReasonEnum.AiSuggest,
      );
    }

    const nextRound = currentRound + 1;
    const askedTopicKeys = session.askedTopicKeys ?? [];
    if (!askedTopicKeys.includes(decision.topicKey)) {
      askedTopicKeys.push(decision.topicKey);
    }

    await this.sessionModel.findByIdAndUpdate(session._id, {
      $push: {
        messages: buildInterviewerMessage(decision.question, nextRound),
      },
      $set: {
        currentRound: nextRound,
        askedTopicKeys,
        lastActivityAt: new Date(),
        expiresAt: computeExpiresAt(new Date()),
      },
    });

    return {
      finished: false,
      nextQuestion: decision.question,
      round: nextRound,
      targetRounds: session.targetRounds,
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
      .findByIdAndUpdate(
        session._id,
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
   */
  async getQuestionAudio(
    sessionId: string,
    userId: string,
    round: number,
  ): Promise<TtsAudio> {
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

    const cacheFilter = {
      sessionId: toObjectId(sessionId),
      round,
    };
    const cached = await this.ttsCacheModel
      .findOne(cacheFilter)
      .lean<{ audio: Buffer; mimeType: string } | null>();
    if (cached?.audio) {
      return { buffer: cached.audio, mimeType: cached.mimeType };
    }

    const audio = await this.ttsService.synthesize(question.content);
    try {
      await this.ttsCacheModel.updateOne(
        cacheFilter,
        {
          $set: {
            sessionId: toObjectId(sessionId),
            round,
            text: question.content,
            audio: audio.buffer,
            mimeType: audio.mimeType,
          },
        },
        { upsert: true },
      );
    } catch (error) {
      // 缓存写失败不影响本次播放，下次点播重新合成
      this.logger.warn('TTS 缓存落库失败', (error as Error).message);
    }
    return audio;
  }

  /**
   * 提交回答的 SSE 流式变体：传输层增强，与 submitAnswer 共用核心逻辑
   * 为后续语音场景 TTS 消费文本流预留。
   */
  submitAnswerSse(
    sessionId: string,
    dto: SubmitAnswerDto,
    userId: string,
  ): Observable<SseEvent> {
    const subject = new Subject<SseEvent>();
    void (async () => {
      try {
        subject.next({ type: 'init', message: '开始处理回答' });
        const result = await this.submitAnswer(sessionId, dto, userId);
        subject.next({
          type: result.finished ? 'finished' : 'question',
          data: result,
        });
        subject.complete();
      } catch (error: any) {
        subject.error(error);
      }
    })();
    return subject.asObservable();
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

  private async appendCandidateMessage(
    session: InterviewSessionDocument,
    dto: SubmitAnswerDto,
  ) {
    const message: Partial<InterviewMessage> = {
      role: MessageRoleEnum.Candidate,
      content: dto.content.trim(),
      round: session.currentRound,
      kind: MessageKindEnum.Answer,
      channel: dto.channel ?? MessageChannelEnum.Text,
    };
    await this.sessionModel.findByIdAndUpdate(session._id, {
      $push: { messages: message },
    });
    session.messages.push(message as InterviewMessage);
  }

  private async completeWithReport(
    session: InterviewSessionDocument,
    endedReason: InterviewEndedReasonEnum,
  ): Promise<SubmitAnswerResult> {
    await this.completeAndSave(session, endedReason);
    return {
      finished: true,
      endedReason,
      targetRounds: session.targetRounds,
    };
  }

  private async completeAndSave(
    session: InterviewSessionDocument,
    endedReason: InterviewEndedReasonEnum,
  ): Promise<InterviewSession> {
    const report = await this.evaluationService.generateReport({
      jobDescription: session.jobDescription,
      levelConfig: session.levelConfig,
      outline: session.outline ?? [],
      messages: session.messages,
      round: session.currentRound,
    });

    const updated = await this.sessionModel
      .findByIdAndUpdate(
        session._id,
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

function buildInterviewerMessage(content: string, round: number) {
  return {
    role: MessageRoleEnum.Interviewer,
    content,
    round,
    kind: MessageKindEnum.Question,
    channel: MessageChannelEnum.Text,
    askedAt: new Date(),
  };
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
  type: 'init' | 'question' | 'finished' | 'error';
  message?: string;
  data?: SubmitAnswerResult | unknown;
}
