import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { Observable } from 'rxjs';
import { EvaluationService } from './services/evaluation.service';
import { QuestionEngineService } from './services/question-engine.service';
import { TtsService } from 'src/ai/tts.service';
import { InterviewService, SseEvent } from './interview.service';
import {
  ExperienceLevelEnum,
  INACTIVITY_TIMEOUT_MS,
  InterviewModeEnum,
  InterviewStageEnum,
  MAX_REVERSE_QUESTIONS,
} from './constants/level.constants';
import { InterviewStatusEnum } from './constants/level.constants';

const MIN_MAIN_DURATION_MS = 30 * 60 * 1000;

describe('InterviewService - 模拟面试编排', () => {
  let service: InterviewService;

  const mockSessionModel = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    findById: jest.fn(),
    updateMany: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  } as any;

  const mockResumeModel = {
    findOne: jest.fn(),
  } as any;

  const mockEngine = {
    generateOutline: jest.fn(),
    generateTurn: jest.fn(),
    generateReverseResponse: jest.fn(),
    generateReverseSuggestions: jest.fn(),
  } as any;

  const mockEvaluation = {
    generateReport: jest.fn(),
  } as any;

  const mockTts = {
    synthesize: jest.fn(),
    synthesizeStream: jest.fn(),
    synthesizePcm: jest.fn(),
  } as any;

  const mockTtsCacheModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
  } as any;

  const userId = 'user-1';
  const SESSION_ID = '507f1f77bcf86cd799439011';
  const levelConfig = {
    mode: InterviewModeEnum.Experienced,
    stage: InterviewStageEnum.First,
    experienceLevel: ExperienceLevelEnum.Mid,
  };
  const validJd = `前端开发工程师（Node.js 方向）
工作地点：上海
公司介绍：某互联网公司，专注于 AI 与数据平台产品研发。
职位描述：
1、负责服务端接口与 BFF 层研发；
2、参与性能优化和架构升级。
任职要求：
1、本科及以上学历；
2、熟悉 Node.js 与数据库设计。
薪资范围：25k-40k。`;
  const createDto = {
    resumeId: '507f1f77bcf86cd799439011',
    jobDescription: validJd,
    levelConfig,
  };
  const resumeDoc = { _id: createDto.resumeId, basicInfo: { name: '张三' } };

  const buildActiveSession = (overrides: Record<string, any> = {}) => ({
    _id: SESSION_ID,
    userId: 'oid-user',
    resumeId: { toString: () => createDto.resumeId },
    jobDescription: validJd,
    levelConfig,
    status: 'in_progress',
    phase: 'main',
    currentRound: 1,
    outline: [{ key: 'topic-a', title: '主题A', questionType: 'project' }],
    askedTopicKeys: ['topic-a'],
    messages: [],
    // 默认进行 10 分钟：主体阶段处于禁止结束窗口（cannot_end）
    startedAt: new Date(Date.now() - 10 * 60 * 1000),
    expiresAt: new Date(Date.now() + 45 * 60 * 1000),
    ...overrides,
  });

  /** 构造 n 条已问的面试官问题（用于撑起题数软上限场景） */
  const buildAskedQuestions = (count: number, startRound = 1) =>
    Array.from({ length: count }, (_, i) => ({
      role: 'interviewer',
      content: `第 ${startRound + i} 个问题`,
      round: startRound + i,
      kind: 'question',
      questionType: 'project',
    }));

  beforeEach(async () => {
    jest.clearAllMocks();
    mockSessionModel.updateOne.mockResolvedValue({});
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InterviewService,
        {
          provide: getModelToken('InterviewSession'),
          useValue: mockSessionModel,
        },
        { provide: getModelToken('Resume'), useValue: mockResumeModel },
        {
          provide: getModelToken('InterviewTtsCache'),
          useValue: mockTtsCacheModel,
        },
        { provide: QuestionEngineService, useValue: mockEngine },
        { provide: EvaluationService, useValue: mockEvaluation },
        { provide: TtsService, useValue: mockTts },
      ],
    }).compile();
    service = module.get<InterviewService>(InterviewService);
  });

  describe('createSession', () => {
    const outline = [
      { key: 'topic-a', title: '自我介绍', questionType: 'self_intro' },
      { key: 'topic-b', title: '项目深挖', questionType: 'project' },
    ];

    const setupHappyPath = () => {
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockSessionModel.findOne.mockResolvedValue(null);
      mockEngine.generateOutline.mockResolvedValue(outline);
    };

    it('should reserve the session slot before calling AI, then fill outline and local intro question', async () => {
      setupHappyPath();
      const reserved = { _id: 'reserved-1', currentRound: 1 };
      mockSessionModel.create.mockResolvedValue(reserved);
      const filled = { ...reserved, outline, currentRound: 1 };
      mockSessionModel.findOneAndUpdate.mockResolvedValue(filled);

      const result = await service.createSession(createDto, userId);

      expect(result).toEqual(filled);
      // 占位落库必须先于 AI 调用：并发双击靠唯一索引即时去重，败者不再烧 LLM
      expect(mockSessionModel.create.mock.invocationCallOrder[0]).toBeLessThan(
        mockEngine.generateOutline.mock.invocationCallOrder[0],
      );
      const createArgs = mockSessionModel.create.mock.calls[0][0];
      expect(createArgs).toMatchObject({
        currentRound: 1,
        phase: 'main',
        messages: [],
        askedTopicKeys: [],
        levelConfig,
      });
      // 新流程不再按题目数结束，不写入 targetRounds
      expect(createArgs.targetRounds).toBeUndefined();
      expect(mockSessionModel.create.mock.calls[0][0].expiresAt).toBeInstanceOf(
        Date,
      );
      // AI 完成后回填大纲与首题；首题为本地模板的自我介绍引导
      expect(mockEngine.generateTurn).not.toHaveBeenCalled();
      // 回填以 (in_progress, 无消息) 为前置条件：生成期间占位被并发关闭
      // 或用户已抢答时不得覆盖
      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        {
          _id: 'reserved-1',
          status: 'in_progress',
          'messages.0': { $exists: false },
        },
        {
          $set: {
            outline,
            askedTopicKeys: ['topic-a'],
            messages: [
              expect.objectContaining({
                role: 'interviewer',
                kind: 'question',
                questionType: 'self_intro',
                round: 1,
                content: expect.stringContaining('自我介绍'),
              }),
            ],
            // 大纲回填成功后过期时间刷新为完整的不活动窗口
            expiresAt: expect.any(Date),
          },
        },
        { new: true },
      );
    });

    it('should skip the outline fill and return the current session when it was already used', async () => {
      setupHappyPath();
      const reserved = { _id: 'reserved-1', currentRound: 1, messages: [] };
      mockSessionModel.create.mockResolvedValue(reserved);
      // 回填前置条件未命中：生成期间用户已抢答
      mockSessionModel.findOneAndUpdate.mockResolvedValue(null);
      const current = {
        ...reserved,
        status: 'in_progress',
        messages: [{ role: 'candidate', content: '抢答内容', round: 1 }],
      };
      mockSessionModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(current),
      });

      const result = await service.createSession(createDto, userId);

      // 返回会话现状，不覆盖已发生的变化
      expect(result).toEqual(current);
      expect(mockSessionModel.findById).toHaveBeenCalledWith('reserved-1');
    });

    it('should reject with conflict when the placeholder was closed during outline generation', async () => {
      setupHappyPath();
      const reserved = { _id: 'reserved-1', currentRound: 1, messages: [] };
      mockSessionModel.create.mockResolvedValue(reserved);
      // 占位会话在生成大纲期间已过期被清扫/被并发关闭：
      // 返回它会让客户端拿到一个不可用的「创建成功」会话
      mockSessionModel.findOneAndUpdate.mockResolvedValue(null);
      mockSessionModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          ...reserved,
          status: 'cancelled',
          endedReason: 'timeout',
        }),
      });

      await expect(service.createSession(createDto, userId)).rejects.toThrow(
        ConflictException,
      );
    });

    it('should normalize campus mode experience level to junior', async () => {
      setupHappyPath();
      const reserved = { _id: 'reserved-1' };
      mockSessionModel.create.mockResolvedValue(reserved);
      mockSessionModel.findOneAndUpdate.mockResolvedValue(reserved);

      await service.createSession(
        {
          ...createDto,
          levelConfig: {
            mode: InterviewModeEnum.Campus,
            stage: InterviewStageEnum.First,
            experienceLevel: ExperienceLevelEnum.Expert,
          },
        },
        userId,
      );

      expect(mockSessionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          levelConfig: {
            mode: InterviewModeEnum.Campus,
            stage: InterviewStageEnum.First,
            experienceLevel: ExperienceLevelEnum.Junior,
          },
        }),
      );
    });

    it('should reject experienced mode with junior level', async () => {
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockSessionModel.findOne.mockResolvedValue(null);

      await expect(
        service.createSession(
          {
            ...createDto,
            levelConfig: {
              mode: InterviewModeEnum.Experienced,
              stage: InterviewStageEnum.First,
              experienceLevel: ExperienceLevelEnum.Junior,
            },
          },
          userId,
        ),
      ).rejects.toThrow('社招模式请选择 mid/senior/expert 经验层级');
      expect(mockSessionModel.create).not.toHaveBeenCalled();
    });

    it('should reject a missing levelConfig with 400 before touching the database', async () => {
      // 纯入参校验必须先于任何 DB 访问：否则这里会退化成 500，
      // 或（已有进行中会话时）被 409 掩盖成"先完成旧面试"
      await expect(
        service.createSession(
          { ...createDto, levelConfig: undefined } as any,
          userId,
        ),
      ).rejects.toThrow('mode 与 stage 为必填项');
      expect(mockResumeModel.findOne).not.toHaveBeenCalled();
      expect(mockSessionModel.findOne).not.toHaveBeenCalled();
      expect(mockSessionModel.create).not.toHaveBeenCalled();
    });

    it('should reject an invalid JD', async () => {
      await expect(
        service.createSession({ ...createDto, jobDescription: '太短' }, userId),
      ).rejects.toThrow(BadRequestException);
      expect(mockResumeModel.findOne).not.toHaveBeenCalled();
    });

    it('should reject when resume not owned by user', async () => {
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      await expect(service.createSession(createDto, userId)).rejects.toThrow(
        '简历不存在',
      );
    });

    it('should reject when an in_progress session exists', async () => {
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockSessionModel.findOne.mockResolvedValue({ _id: 'running' });

      await expect(service.createSession(createDto, userId)).rejects.toThrow(
        ConflictException,
      );
      expect(mockEngine.generateOutline).not.toHaveBeenCalled();
    });

    it('should release an expired leftover session and proceed with creation', async () => {
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      // 崩溃/发布重启残留的过期会话（含占位）：应自动关闭而非阻塞新建
      mockSessionModel.findOne.mockResolvedValue({
        _id: 'stale',
        status: 'in_progress',
        expiresAt: new Date(Date.now() - 1000),
      });
      const reserved = { _id: 'reserved-1' };
      mockSessionModel.create.mockResolvedValue(reserved);
      mockSessionModel.findOneAndUpdate.mockResolvedValue(reserved);
      mockEngine.generateOutline.mockResolvedValue(outline);

      const result = await service.createSession(createDto, userId);

      expect(result).toEqual(reserved);
      // 残留会话以 timeout 关闭（仅命中 in_progress），随后正常创建新会话
      const [staleFilter, staleUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(staleFilter).toEqual({
        _id: 'stale',
        status: 'in_progress',
      });
      expect(staleUpdate.$set.status).toBe('cancelled');
      expect(staleUpdate.$set.endedReason).toBe('timeout');
      expect(mockSessionModel.create).toHaveBeenCalled();
    });

    it('should grant the placeholder only the short outline-fill expiry window', async () => {
      setupHappyPath();
      const reserved = { _id: 'reserved-1' };
      mockSessionModel.create.mockResolvedValue(reserved);
      mockSessionModel.findOneAndUpdate.mockResolvedValue(reserved);

      await service.createSession(createDto, userId);

      const created = mockSessionModel.create.mock.calls[0][0];
      const expiresAt = created.expiresAt as Date;
      // 窗口需覆盖大纲生成最坏耗时（120s × 3 = 6 分钟），取 8 分钟
      expect(expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 8 * 60_000);
      // 占位窗口仍远小于完整不活动窗口（45 分钟），崩溃残留不会长期阻塞新建
      expect(expiresAt.getTime()).toBeLessThan(
        Date.now() + 45 * 60_000 - 60_000,
      );
    });

    it('should map duplicate key error to conflict without calling AI', async () => {
      setupHappyPath();
      mockSessionModel.create.mockRejectedValue({ code: 11000 });

      await expect(service.createSession(createDto, userId)).rejects.toThrow(
        ConflictException,
      );
      // 并发败者不应再触发任何 LLM 往返
      expect(mockEngine.generateOutline).not.toHaveBeenCalled();
    });

    it('should release the reserved slot when AI generation fails', async () => {
      setupHappyPath();
      const reserved = { _id: 'reserved-1' };
      mockSessionModel.create.mockResolvedValue(reserved);
      mockEngine.generateOutline.mockRejectedValue(new Error('AI 超时'));
      mockSessionModel.deleteOne.mockResolvedValue({});

      await expect(service.createSession(createDto, userId)).rejects.toThrow(
        'AI 超时',
      );
      // 占位会话应被删除，释放单会话名额供用户重试
      expect(mockSessionModel.deleteOne).toHaveBeenCalledWith({
        _id: 'reserved-1',
        status: 'in_progress',
      });
    });
  });

  describe('getCurrentSession', () => {
    it('should return null when no active session', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);
      expect(await service.getCurrentSession(userId)).toBeNull();
    });

    it('should close and return an expired session', async () => {
      const expired = buildActiveSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSessionModel.findOne.mockResolvedValue(expired);
      // 复用同一个对象作为库返回：断言内存状态是同步来的，而非本来就一致
      mockSessionModel.findOneAndUpdate.mockResolvedValue({ _id: SESSION_ID });

      const result = await service.getCurrentSession(userId);

      // 超时会话应被关闭并返回（前端据此提示"上次面试因超时已关闭"）
      expect(result!.status).toBe('cancelled');
      expect(result!.endedReason).toBe('timeout');
      // 关闭写库与返回体同源（timeoutCloseFields）：只同步 status/endedReason
      // 会让前端拿不到 endedAt，返回体与库内不一致
      const [, closeUpdate] = mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(closeUpdate.$set.endedAt).toBeInstanceOf(Date);
      expect(result!.endedAt).toBeInstanceOf(Date);
      expect(result!.endedAt!.getTime()).toBe(
        closeUpdate.$set.endedAt.getTime(),
      );
      // 关闭以 status=in_progress 为前置条件，不覆盖并发完成的会话终态
      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: SESSION_ID, status: 'in_progress' },
        expect.anything(),
      );
    });

    it('should sync the real terminal state when the session was closed concurrently', async () => {
      const expired = buildActiveSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      const endedAt = new Date();
      mockSessionModel.findOne.mockResolvedValue(expired);
      // 条件更新未命中：并发的收尾/中断已经赢了这次关闭
      mockSessionModel.findOneAndUpdate.mockResolvedValue(null);
      mockSessionModel.findById.mockReturnValue({
        lean: () =>
          Promise.resolve({
            status: 'completed',
            endedReason: 'completed',
            endedAt,
          }),
      });

      const result = await service.getCurrentSession(userId);

      // 未命中时不得改写终态，且内存文档须同步为 DB 现状（含 endedAt）
      expect(result!.status).toBe('completed');
      expect(result!.endedReason).toBe('completed');
      expect(result!.endedAt).toBe(endedAt);
    });
  });

  describe('submitAnswer - 主体考察阶段', () => {
    const answerDto = { content: '我的回答是……' };

    /** findOneAndUpdate 默认成功返回文档（兼容直接 await 与 .lean() 链两种调用）；个别用例再覆盖 */
    const mockConditionalUpdateOk = (overrides: Record<string, any> = {}) => {
      const doc = {
        _id: SESSION_ID,
        ...overrides,
        lean: () => Promise.resolve({ _id: SESSION_ID, ...overrides }),
      };
      mockSessionModel.findOneAndUpdate.mockReturnValue(doc);
    };

    const validTurn = {
      feedback: {
        completeness: 70,
        logic: 85,
        depth: 55,
        comment: '讲清了方案，缺少量化数据',
      },
      topicKey: 'topic-b',
      question: '下一题：讲讲索引原理。',
      questionType: 'project',
      isFollowUp: false,
      shouldEndMainPhase: false,
    };

    it('should append the answer, write feedback and the next question', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateTurn.mockResolvedValue(validTurn);

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.nextQuestion).toBe('下一题：讲讲索引原理。');
      expect(result.round).toBe(3);
      expect(result.phase).toBe('main');
      expect(result.feedback).toEqual(validTurn.feedback);
      expect(result.elapsedMinutes).toBe(10);
      // 追加回答 + 写下一题两次条件更新
      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      // 追加回答：以 (status, currentRound) 为前置条件，竞态时不生效；
      // messages 过滤条件保证同轮次不出现重复内容的候选人消息
      const [appendFilter, appendUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(appendFilter).toEqual({
        _id: SESSION_ID,
        status: 'in_progress',
        currentRound: 2,
        messages: {
          $not: {
            $elemMatch: {
              role: 'candidate',
              round: 2,
              content: '我的回答是……',
            },
          },
        },
      });
      expect(appendUpdate.$push.messages).toMatchObject({
        role: 'candidate',
        content: '我的回答是……',
        round: 2,
      });
      expect(appendUpdate.$set.expiresAt).toBeInstanceOf(Date);
      // 逐题反馈通过 arrayFilters 回写到本轮被评估的那条候选人消息
      // （含内容匹配：同轮重试换答案时反馈只落在新答案上）；
      // 与其余会话写入同口径，带 (status, currentRound) 前置条件
      expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
        {
          _id: SESSION_ID,
          status: 'in_progress',
          currentRound: 2,
        },
        {
          $set: { 'messages.$[msg].feedback': validTurn.feedback },
        },
        {
          arrayFilters: [
            {
              'msg.role': 'candidate',
              'msg.round': 2,
              'msg.content': '我的回答是……',
            },
          ],
        },
      );
      // 写下一题：同样带轮次前置条件，防止与并发请求/收尾操作互踩
      const [nextFilter, nextUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[1];
      expect(nextFilter).toEqual({
        _id: SESSION_ID,
        status: 'in_progress',
        currentRound: 2,
      });
      expect(nextUpdate.$push.messages).toMatchObject({
        role: 'interviewer',
        content: '下一题：讲讲索引原理。',
        round: 3,
        questionType: 'project',
      });
      expect(nextUpdate.$set.currentRound).toBe(3);
      expect(nextUpdate.$set.askedTopicKeys).toEqual(['topic-a', 'topic-b']);
    });

    it('should reject a whitespace-only answer before any write or AI call', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);

      await expect(
        service.submitAnswer(session._id, { content: '   ' } as any, userId),
      ).rejects.toThrow('回答内容不能为空');
      expect(mockSessionModel.findOneAndUpdate).not.toHaveBeenCalled();
      expect(mockEngine.generateTurn).not.toHaveBeenCalled();
    });

    it('should keep interviewing when the resume was deleted mid-session', async () => {
      // 简历在面试进行中被硬删时降级为空的简历上下文：否则每次答题都
      // 400「简历不存在」，面试会卡死到超时（只能 /finish 或 /cancel）
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockEngine.generateTurn.mockResolvedValue(validTurn);

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.nextQuestion).toBe('下一题：讲讲索引原理。');
      expect(mockEngine.generateTurn.mock.calls[0][0].resume).toEqual({});
    });

    it('should reject with conflict when the answer round was concurrently advanced', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      // 条件更新未命中：读取后轮次已被并发请求推进或会话已被关闭
      mockSessionModel.findOneAndUpdate.mockReturnValue(null);

      await expect(
        service.submitAnswer(session._id, answerDto, userId),
      ).rejects.toThrow(ConflictException);
      expect(mockEngine.generateTurn).not.toHaveBeenCalled();
    });

    it('should reject with conflict when the next question update lost the race', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      // 回答追加成功，但下一题写入时轮次已被推进（另一请求先完成）
      mockSessionModel.findOneAndUpdate
        .mockReturnValueOnce({
          lean: () => Promise.resolve({ _id: SESSION_ID }),
        })
        .mockReturnValueOnce(null);
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateTurn.mockResolvedValue(validTurn);

      await expect(
        service.submitAnswer(session._id, answerDto, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should roll back the appended answer when the turn generation fails', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateTurn.mockRejectedValue(new Error('AI 超时'));

      await expect(
        service.submitAnswer(session._id, answerDto, userId),
      ).rejects.toThrow('AI 超时');

      // 被放弃的回答应从转录中移除（带 in_progress/round 前置条件），
      // 不再以无反馈回答的形态混入报告
      expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
        {
          _id: SESSION_ID,
          status: 'in_progress',
          currentRound: 2,
        },
        {
          $pull: {
            messages: {
              role: 'candidate',
              round: 2,
              content: '我的回答是……',
              kind: 'answer',
            },
          },
        },
      );
    });

    it('should not re-append the same answer when retrying after a failed generation', async () => {
      const lastAnswer = {
        role: 'candidate',
        content: '我的回答是……',
        round: 2,
        kind: 'answer',
      };
      const session = buildActiveSession({
        currentRound: 2,
        messages: [lastAnswer],
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateTurn.mockResolvedValue(validTurn);

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      // 同轮次同内容的回答已在库（上次出题失败前的落库），不应重复 $push；
      // 但仍应以条件更新刷新活跃窗口
      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
      // 第一次条件写入是活跃窗口刷新（带 status/round 前置条件：
      // 会话已被并发收尾时不得续期，也不应继续触发付费 LLM 调用）
      const [refreshFilter, refreshUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(refreshFilter).toEqual({
        _id: SESSION_ID,
        status: 'in_progress',
        currentRound: 2,
      });
      expect(refreshUpdate.$set).toMatchObject({
        expiresAt: expect.any(Date),
      });
      // 第二次条件写入是下一题（interviewer 消息），没有再追加候选人回答
      const [nextFilter, nextUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[1];
      expect(nextFilter).toMatchObject({ currentRound: 2 });
      expect(nextUpdate.$push.messages).toMatchObject({
        role: 'interviewer',
        round: 3,
      });
      // 回合决策引擎仍应看到本轮回答
      expect(mockEngine.generateTurn.mock.calls[0][0].messages).toContainEqual(
        expect.objectContaining({ content: '我的回答是……' }),
      );
    });

    it('should ignore AI end suggestion before the 30-minute floor', async () => {
      const session = buildActiveSession({ currentRound: 1 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      // 不足 30 分钟即使 AI 建议结束也必须继续出题
      mockEngine.generateTurn.mockResolvedValue({
        ...validTurn,
        shouldEndMainPhase: true,
        question: '今天到这里吧，你有什么想问我的吗？',
        questionType: 'reverse',
      });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.phase).toBe('main');
      expect(mockEvaluation.generateReport).not.toHaveBeenCalled();
      // 仍写入下一题
      expect(mockSessionModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
    });

    it('should end immediately with a farewell when the candidate explicitly requests to end', async () => {
      // 不足 30 分钟（cannot_end 政策），但候选人明确要求终止面试：
      // 必须无视结束政策，以告别语直接收尾出报告，而不是继续追问
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      const farewell =
        '理解你今天的时间安排，感谢你的分享，祝求职顺利，期待下次交流。';
      mockEngine.generateTurn.mockResolvedValue({
        ...validTurn,
        question: farewell,
        questionType: 'reverse',
        shouldEndMainPhase: true,
        userRequestedEnd: true,
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 60 });

      const progressEvents: SseEvent[] = [];
      const result = await service.submitAnswer(
        session._id,
        answerDto,
        userId,
        (event) => progressEvents.push(event),
      );

      expect(result.finished).toBe(true);
      expect(result.endedReason).toBe('user_finish');
      expect(result.farewell).toBe(farewell);
      // 告别语先于报告生成推送，前端可立即渲染
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0].type).toBe('closing');
      expect(progressEvents[0].data).toMatchObject({
        farewell,
        round: 3,
        phase: 'main',
      });
      // 告别语随转录进报告
      const reportInput = mockEvaluation.generateReport.mock.calls[0][0];
      expect(reportInput.messages).toContainEqual(
        expect.objectContaining({ role: 'interviewer', content: farewell }),
      );
      // 会话以 completed + user_finish 落库
      const [filter, update] =
        mockSessionModel.findOneAndUpdate.mock.calls.at(-1);
      expect(filter).toEqual({ _id: SESSION_ID, status: 'in_progress' });
      expect(update.$set.status).toBe('completed');
      expect(update.$set.endedReason).toBe('user_finish');
    });

    it('should continue interviewing past 30 minutes while questions are within the soft cap', async () => {
      const session = buildActiveSession({
        currentRound: 16,
        startedAt: new Date(Date.now() - (MIN_MAIN_DURATION_MS + 5 * 60_000)),
        messages: buildAskedQuestions(15),
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      // 满 30 分钟但题数未超软上限：AI 建议结束被忽略
      mockEngine.generateTurn.mockResolvedValue({
        ...validTurn,
        shouldEndMainPhase: true,
        questionType: 'reverse',
      });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.phase).toBe('main');
      expect(mockEvaluation.generateReport).not.toHaveBeenCalled();
    });

    it('should enter the reverse phase when AI decides to end past the soft cap', async () => {
      const session = buildActiveSession({
        currentRound: 18,
        startedAt: new Date(Date.now() - (MIN_MAIN_DURATION_MS + 10 * 60_000)),
        messages: buildAskedQuestions(17),
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      const closingQuestion = '今天聊得很好，你有什么想问我的吗？';
      mockEngine.generateTurn.mockResolvedValue({
        ...validTurn,
        question: closingQuestion,
        questionType: 'reverse',
        shouldEndMainPhase: true,
      });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.phase).toBe('reverse');
      expect(result.nextQuestion).toBe(closingQuestion);
      expect(mockEvaluation.generateReport).not.toHaveBeenCalled();
      // 切换 phase 与收尾引导语在同一个条件更新中
      const [filter, update] =
        mockSessionModel.findOneAndUpdate.mock.calls.at(-1);
      expect(filter).toMatchObject({
        _id: SESSION_ID,
        status: 'in_progress',
        currentRound: 18,
      });
      expect(update.$set.phase).toBe('reverse');
      expect(update.$push.messages).toMatchObject({
        role: 'interviewer',
        content: closingQuestion,
        questionType: 'reverse',
      });
    });

    it('should force the reverse phase with a template closing when the 60-minute cap is hit', async () => {
      const session = buildActiveSession({
        currentRound: 20,
        startedAt: new Date(Date.now() - 61 * 60_000),
        messages: buildAskedQuestions(19),
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      // AI 未按约定输出收尾引导（shouldEndMainPhase=false / 非 reverse 题型）
      mockEngine.generateTurn.mockResolvedValue(validTurn);

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.phase).toBe('reverse');
      // AI 未输出收尾语时由本地模板兜底，反问环节必须开启
      expect(result.nextQuestion).toContain('你有什么想问我的吗');
      const [, update] = mockSessionModel.findOneAndUpdate.mock.calls.at(-1);
      expect(update.$set.phase).toBe('reverse');
      expect(update.$push.messages.questionType).toBe('reverse');
    });

    it('should reject with conflict when session has timed out', async () => {
      const session = buildActiveSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSessionModel.findOne.mockResolvedValue(session);

      await expect(
        service.submitAnswer(SESSION_ID, answerDto, userId),
      ).rejects.toThrow(ConflictException);
      expect(mockEngine.generateTurn).not.toHaveBeenCalled();
    });

    it('should reject when session is already ended', async () => {
      const session = buildActiveSession({ status: 'completed' });
      mockSessionModel.findOne.mockResolvedValue(session);

      await expect(
        service.submitAnswer(SESSION_ID, answerDto, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should validate the session before the SSE observable is created', async () => {
      const session = buildActiveSession({ status: 'completed' });
      mockSessionModel.findOne.mockResolvedValue(session);

      // 校验前置：无效会话在返回 Observable 之前就抛出，
      // 控制器得以在设置 SSE 头之前返回标准 JSON 错误包络
      await expect(
        service.submitAnswerSse(SESSION_ID, answerDto, userId),
      ).rejects.toThrow(ConflictException);
    });

    it('should emit feedback before the next question in the SSE stream', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateTurn.mockResolvedValue(validTurn);

      const events$ = await service.submitAnswerSse(
        session._id,
        answerDto,
        userId,
      );
      const events = await collectEvents(events$);

      expect(events.map((e) => e.type)).toEqual([
        'init',
        'feedback',
        'question',
      ]);
      expect(events[1].data).toEqual(validTurn.feedback);
      expect(events[2].data.nextQuestion).toBe(validTurn.question);
    });
  });

  describe('submitAnswer - 反问环节', () => {
    const answerDto = { content: '想了解一下团队现在的技术栈？' };

    const mockConditionalUpdateOk = () => {
      mockSessionModel.findOneAndUpdate.mockReturnValue({
        lean: () => Promise.resolve({ _id: SESSION_ID }),
      });
    };

    const buildReverseSession = (overrides: Record<string, any> = {}) =>
      buildActiveSession({
        phase: 'reverse',
        currentRound: 10,
        messages: [
          {
            role: 'interviewer',
            content: '我的问题问完了，你有什么想问我的吗？',
            round: 10,
            kind: 'question',
            questionType: 'reverse',
          },
        ],
        ...overrides,
      });

    it('should answer the candidate reverse question in the interviewer persona', async () => {
      const session = buildReverseSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateReverseResponse.mockResolvedValue({
        response: '团队主要用 Node.js + TypeScript，你还有什么想了解的吗？',
        continueReverse: true,
      });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.phase).toBe('reverse');
      expect(result.nextQuestion).toContain('Node.js');
      // 候选人反问消息应标注 questionType=reverse
      const [, appendUpdate] = mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(appendUpdate.$push.messages).toMatchObject({
        role: 'candidate',
        questionType: 'reverse',
      });
      // 面试官回应作为问题消息落库
      const [, responseUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[1];
      expect(responseUpdate.$push.messages).toMatchObject({
        role: 'interviewer',
        questionType: 'reverse',
        round: 11,
      });
    });

    it('should roll back the appended reverse question when the response generation fails', async () => {
      const session = buildReverseSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateReverseResponse.mockRejectedValue(
        new Error('AI 超时'),
      );

      await expect(
        service.submitAnswer(session._id, answerDto, userId),
      ).rejects.toThrow('AI 超时');

      // 被放弃的反问不得留在转录里（会以"无回应反问"形态混进报告）
      expect(mockSessionModel.updateOne).toHaveBeenCalledWith(
        { _id: SESSION_ID, status: 'in_progress', currentRound: 10 },
        {
          $pull: {
            messages: {
              role: 'candidate',
              round: 10,
              content: answerDto.content,
              kind: 'answer',
            },
          },
        },
      );
    });

    it('should complete with a report when the candidate has no more questions', async () => {
      const session = buildReverseSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateReverseResponse.mockResolvedValue({
        response: '好的，今天的面试就到这里，感谢你的时间。',
        continueReverse: false,
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 82 });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(true);
      expect(result.endedReason).toBe('completed');
      // 面试官的收尾回应也要落库后再出报告
      expect(mockEvaluation.generateReport).toHaveBeenCalledTimes(1);
      // 报告的转录必须包含面试官的最后回应（收尾前同步进内存 messages）
      const reportInput = mockEvaluation.generateReport.mock.calls[0][0];
      expect(reportInput.messages).toContainEqual(
        expect.objectContaining({
          role: 'interviewer',
          content: '好的，今天的面试就到这里，感谢你的时间。',
        }),
      );
      const [filter, update] =
        mockSessionModel.findOneAndUpdate.mock.calls.at(-1);
      expect(filter).toEqual({ _id: SESSION_ID, status: 'in_progress' });
      expect(update.$set.status).toBe('completed');
      expect(update.$set.report).toEqual({ overallScore: 82 });
    });

    it('should emit a closing progress event with the farewell before generating the report', async () => {
      const session = buildReverseSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateReverseResponse.mockResolvedValue({
        response: '好的，今天的面试就到这里，感谢你的时间。',
        continueReverse: false,
      });
      // 报告生成是收尾路径上最慢的一步，用延迟模拟，验证告别语先于其完成推送
      mockEvaluation.generateReport.mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve({ overallScore: 82 }), 20),
          ),
      );

      const progressEvents: SseEvent[] = [];
      const result = await service.submitAnswer(
        session._id,
        answerDto,
        userId,
        (event) => progressEvents.push(event),
      );

      // 告别语必须先于报告生成推送给客户端，避免收尾等待全程静默
      expect(progressEvents).toHaveLength(1);
      expect(progressEvents[0].type).toBe('closing');
      expect(progressEvents[0].data).toMatchObject({
        farewell: '好的，今天的面试就到这里，感谢你的时间。',
        round: 11,
        phase: 'reverse',
      });
      expect(result.finished).toBe(true);
      expect(result.farewell).toBe('好的，今天的面试就到这里，感谢你的时间。');
    });

    it('should retry only the report when the previous closing turn failed to generate it', async () => {
      // 报告生成失败后的会话状态：收尾消息已落库、pendingReportReason 标记
      // 存在、状态仍是 in_progress（报告链路最长 8 分钟且可能失败）
      const farewell = '好的，今天的面试就到这里，感谢你的时间。';
      const session = buildReverseSession({
        currentRound: 11,
        pendingReportReason: 'completed',
        messages: [
          {
            role: 'interviewer',
            content: '我的问题问完了，你有什么想问我的吗？',
            round: 10,
            kind: 'question',
            questionType: 'reverse',
          },
          {
            role: 'candidate',
            content: '想了解一下团队现在的技术栈？',
            round: 10,
            kind: 'answer',
            questionType: 'reverse',
          },
          {
            role: 'interviewer',
            content: farewell,
            round: 11,
            kind: 'question',
            questionType: 'reverse',
          },
        ],
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 82 });

      const progressEvents: SseEvent[] = [];
      const result = await service.submitAnswer(
        session._id,
        answerDto,
        userId,
        (event) => progressEvents.push(event),
      );

      // 对话不再推进：不重复调用反问/出题链，也不追加任何消息
      expect(mockEngine.generateReverseResponse).not.toHaveBeenCalled();
      expect(mockEngine.generateTurn).not.toHaveBeenCalled();
      expect(
        mockSessionModel.findOneAndUpdate.mock.calls.some(
          ([, update]) => update?.$push?.messages,
        ),
      ).toBe(false);
      // 只补生成报告；告别语从转录末条面试官消息还原并重推 closing 事件
      expect(mockEvaluation.generateReport).toHaveBeenCalledTimes(1);
      expect(result.finished).toBe(true);
      expect(result.endedReason).toBe('completed');
      expect(result.farewell).toBe(farewell);
      expect(progressEvents[0]).toMatchObject({
        type: 'closing',
        data: { farewell, round: 11, phase: 'reverse' },
      });
    });

    it(`should force completion after ${MAX_REVERSE_QUESTIONS} reverse questions`, async () => {
      const session = buildReverseSession({
        messages: [
          ...buildAskedQuestions(2, 8),
          {
            role: 'candidate',
            content: '问题一',
            round: 10,
            kind: 'answer',
            questionType: 'reverse',
          },
          {
            role: 'interviewer',
            content: '回应一',
            round: 11,
            kind: 'question',
            questionType: 'reverse',
          },
          {
            role: 'candidate',
            content: '问题二',
            round: 11,
            kind: 'answer',
            questionType: 'reverse',
          },
        ],
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockConditionalUpdateOk();
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateReverseResponse.mockResolvedValue({
        response: '这是最后一个问题的回应。',
        continueReverse: true,
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 70 });

      // 这是候选人的第 3 个反问，达到上限后即便 AI 愿意继续也强制收尾
      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(true);
      expect(result.endedReason).toBe('completed');
      expect(mockEvaluation.generateReport).toHaveBeenCalledTimes(1);
    });
  });

  describe('getReverseSuggestions', () => {
    it('should generate suggestions from the session context', async () => {
      const session = buildActiveSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      const suggestions = [
        { title: '团队技术栈', content: '想了解团队核心的技术栈？' },
      ];
      mockEngine.generateReverseSuggestions.mockResolvedValue(suggestions);

      const result = await service.getReverseSuggestions(SESSION_ID, userId);

      expect(result).toEqual(suggestions);
      expect(mockEngine.generateReverseSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({
          jobDescription: validJd,
          levelConfig,
          messages: session.messages,
        }),
      );
    });

    it('should reject when session is not owned', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);

      await expect(
        service.getReverseSuggestions(SESSION_ID, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('should still suggest when the resume was deleted mid-session', async () => {
      // 与答题链路同一降级策略：简历缺失只是少了上下文，不该让接口整体 400
      const session = buildActiveSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockEngine.generateReverseSuggestions.mockResolvedValue([]);

      await service.getReverseSuggestions(SESSION_ID, userId);

      expect(mockEngine.generateReverseSuggestions).toHaveBeenCalledWith(
        expect.objectContaining({ resume: {} }),
      );
    });
  });

  describe('cancelSession / finishSession', () => {
    it('should cancel without calling AI or generating a report', async () => {
      const session = buildActiveSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findOneAndUpdate.mockReturnValue({
        lean: () =>
          Promise.resolve({
            ...session,
            status: 'cancelled',
            endedReason: 'user_cancel',
          }),
      });

      const result = await service.cancelSession(SESSION_ID, userId);

      expect(result.status).toBe('cancelled');
      expect(result.endedReason).toBe('user_cancel');
      expect(mockEvaluation.generateReport).not.toHaveBeenCalled();
      expect(mockEngine.generateTurn).not.toHaveBeenCalled();
      // 中断操作同样以 status 为前置条件，避免覆盖并发收尾的终态
      const [filter] = mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: SESSION_ID, status: 'in_progress' });
    });

    it('should finish with report on explicit finish from the main phase', async () => {
      const session = buildActiveSession({
        currentRound: 3,
        messages: buildAskedQuestions(3),
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findOneAndUpdate.mockReturnValue({
        lean: () => Promise.resolve({ ...session, status: 'completed' }),
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 70 });

      await service.finishSession(SESSION_ID, userId);

      expect(mockEvaluation.generateReport).toHaveBeenCalledTimes(1);
      // 报告应使用当前已有的全部对话，并按时长+题数评估完成度
      const reportParams = mockEvaluation.generateReport.mock.calls[0][0];
      expect(reportParams.messages).toBe(session.messages);
      expect(reportParams.levelConfig).toEqual(levelConfig);
      expect(reportParams.questionCount).toBe(3);
      expect(reportParams.durationMinutes).toBeGreaterThanOrEqual(10);
      // 收尾更新以 status 为前置条件
      const [filter] = mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: SESSION_ID, status: 'in_progress' });
    });

    it('should keep the session alive while the report is generating', async () => {
      // 报告链路最长 2×240s：收尾标记若只刷 lastActivityAt 而不续 expiresAt，
      // 会话会在生成期间被超时清扫改成 cancelled，报告落库的 status 前置条件
      // 失配 → 已付费生成的报告被丢弃，且用户无法重试
      const session = buildActiveSession({
        currentRound: 3,
        messages: buildAskedQuestions(3),
        expiresAt: new Date(Date.now() + 30_000),
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findOneAndUpdate.mockReturnValue({
        lean: () => Promise.resolve({ ...session, status: 'completed' }),
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 70 });

      await service.finishSession(SESSION_ID, userId);

      const [markFilter, markUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(markFilter).toEqual({ _id: SESSION_ID, status: 'in_progress' });
      expect(markUpdate.$set.pendingReportReason).toBe('user_finish');
      expect(markUpdate.$set.expiresAt).toBeInstanceOf(Date);
      expect(markUpdate.$set.expiresAt.getTime()).toBeGreaterThan(
        Date.now() + INACTIVITY_TIMEOUT_MS - 60_000,
      );
    });

    it('should keep the original end reason when finishing a session pending report', async () => {
      // 反问自然收尾后报告生成失败：用户点「收尾出报告」重试时，
      // 结束原因应沿用 completed，不能覆写成 user_finish
      const session = buildActiveSession({
        phase: 'reverse',
        currentRound: 4,
        messages: buildAskedQuestions(3),
        pendingReportReason: 'completed',
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findOneAndUpdate.mockReturnValue({
        lean: () => Promise.resolve({ ...session, status: 'completed' }),
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 70 });

      await service.finishSession(SESSION_ID, userId);

      // 先落收尾标记再生成报告，最后以 status 为前置条件收尾
      const [markFilter, markUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls[0];
      expect(markFilter).toEqual({ _id: SESSION_ID, status: 'in_progress' });
      expect(markUpdate.$set.pendingReportReason).toBe('completed');
      const [, finalUpdate] =
        mockSessionModel.findOneAndUpdate.mock.calls.at(-1);
      expect(finalUpdate.$set.endedReason).toBe('completed');
      expect(finalUpdate.$unset).toEqual({ pendingReportReason: 1 });
    });
  });

  describe('getReport', () => {
    it('should reject when report not yet generated', async () => {
      mockSessionModel.findOne.mockResolvedValue(buildActiveSession());
      await expect(service.getReport(SESSION_ID, userId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should return the stored report', async () => {
      const report = { overallScore: 88 };
      mockSessionModel.findOne.mockResolvedValue(
        buildActiveSession({ report, status: 'completed' }),
      );
      expect(await service.getReport(SESSION_ID, userId)).toBe(report);
    });
  });

  describe('getQuestionAudio', () => {
    const sessionWithQuestion = buildActiveSession({
      status: 'completed',
      messages: [
        {
          role: 'interviewer',
          content: '第一题：请介绍一下事件循环。',
          round: 1,
          kind: 'question',
        },
        { role: 'candidate', content: '我的回答', round: 1, kind: 'answer' },
      ],
    });

    // 默认无缓存、写缓存成功，个别用例再覆盖
    beforeEach(() => {
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockTtsCacheModel.updateOne.mockResolvedValue({});
    });

    it('should synthesize pcm via tts service and wrap it into wav', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizePcm.mockResolvedValue({
        pcm: Buffer.from('pcm-bytes'),
        meta: { sampleRate: 24000, channels: 1 },
      });

      const result = await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(result.mimeType).toBe('audio/wav');
      expect(result.buffer.subarray(0, 4).toString('ascii')).toBe('RIFF');
      expect(result.buffer.subarray(44).toString()).toBe('pcm-bytes');
      // 聚合逻辑统一走 synthesizePcm，不再复刻 for-await 消费循环
      expect(mockTts.synthesizePcm).toHaveBeenCalledWith(
        '第一题：请介绍一下事件循环。',
      );
      expect(mockTts.synthesizeStream).not.toHaveBeenCalled();
    });

    it('should share one in-flight synthesis for concurrent misses (single-flight)', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      let resolveSynthesis!: (value: any) => void;
      mockTts.synthesizePcm.mockReturnValue(
        new Promise((resolve) => (resolveSynthesis = resolve)),
      );

      const both = Promise.all([
        service.getQuestionAudio(SESSION_ID, userId, 1),
        service.getQuestionAudio(SESSION_ID, userId, 1),
      ]);
      // 等两个请求都进入合成等待（微任务队列清空）后再完成合成
      await new Promise((resolve) => setImmediate(resolve));
      resolveSynthesis({
        pcm: Buffer.from('shared-pcm'),
        meta: { sampleRate: 24000, channels: 1 },
      });
      const [first, second] = await both;

      // 同一 (sessionId, round) 的并发未命中只发起一次付费合成
      expect(mockTts.synthesizePcm).toHaveBeenCalledTimes(1);
      expect(first.buffer.subarray(44).toString()).toBe('shared-pcm');
      expect(second.buffer.subarray(44).toString()).toBe('shared-pcm');

      // 完成后在途记录清除：后续未命中可重新合成（如缓存写失败场景）
      await service.getQuestionAudio(SESSION_ID, userId, 1);
      expect(mockTts.synthesizePcm).toHaveBeenCalledTimes(2);
    });

    it('should return cached pcm (wrapped) without calling tts again', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          audio: Buffer.from('cached-pcm'),
          mimeType: 'audio/pcm',
          sampleRate: 24000,
        }),
      });

      const result = await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(result.mimeType).toBe('audio/wav');
      expect(result.buffer.subarray(44).toString()).toBe('cached-pcm');
      expect(mockTts.synthesizePcm).not.toHaveBeenCalled();
      expect(mockTtsCacheModel.updateOne).not.toHaveBeenCalled();
    });

    it('should wrap lean bson binary cache into wav (mongoose 9 lean returns Binary)', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          // mongoose 9 + bson 7：lean() 对 Buffer 字段返回 BSON Binary
          audio: new mongoose.mongo.Binary(Buffer.from('cached-pcm'), 0),
          mimeType: 'audio/pcm',
          sampleRate: 24000,
        }),
      });

      const result = await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(result.mimeType).toBe('audio/wav');
      expect(result.buffer.subarray(44).toString()).toBe('cached-pcm');
      expect(mockTts.synthesizePcm).not.toHaveBeenCalled();
    });

    it('should treat legacy wav cache (no sampleRate) as stale and regenerate', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          audio: Buffer.from('old-wav'),
          mimeType: 'audio/wav',
        }),
      });
      mockTts.synthesizePcm.mockResolvedValue({
        pcm: Buffer.from('fresh-pcm'),
        meta: { sampleRate: 24000, channels: 1 },
      });

      await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(mockTts.synthesizePcm).toHaveBeenCalled();
      expect(mockTtsCacheModel.updateOne).toHaveBeenCalledWith(
        { sessionId: expect.anything(), round: 1 },
        {
          $set: expect.objectContaining({
            audio: Buffer.from('fresh-pcm'),
            mimeType: 'audio/pcm',
            sampleRate: 24000,
          }),
        },
        { upsert: true },
      );
    });

    it('should upsert synthesized pcm into the cache', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizePcm.mockResolvedValue({
        pcm: Buffer.from('fresh-pcm'),
        meta: { sampleRate: 24000, channels: 1 },
      });

      await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(mockTtsCacheModel.updateOne).toHaveBeenCalledWith(
        {
          sessionId: expect.anything(),
          round: 1,
        },
        {
          $set: {
            sessionId: expect.anything(),
            round: 1,
            text: '第一题：请介绍一下事件循环。',
            audio: Buffer.from('fresh-pcm'),
            mimeType: 'audio/pcm',
            sampleRate: 24000,
          },
        },
        { upsert: true },
      );
    });

    it('should still return audio when caching fails', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizePcm.mockResolvedValue({
        pcm: Buffer.from('pcm-bytes'),
        meta: { sampleRate: 24000, channels: 1 },
      });
      mockTtsCacheModel.updateOne.mockRejectedValue(new Error('dup key'));

      await expect(
        service.getQuestionAudio(SESSION_ID, userId, 1),
      ).resolves.toEqual({
        buffer: expect.anything(),
        mimeType: 'audio/wav',
      });
    });

    it('should stay available for ended sessions (replay)', async () => {
      // 会话已 completed，回放场景仍可获取历史问题语音
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizePcm.mockResolvedValue({
        pcm: Buffer.from('pcm'),
        meta: { sampleRate: 24000, channels: 1 },
      });

      await expect(
        service.getQuestionAudio(SESSION_ID, userId, 1),
      ).resolves.toBeTruthy();
    });

    it('should reject when the round has no interviewer question', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);

      await expect(
        service.getQuestionAudio(SESSION_ID, userId, 9),
      ).rejects.toThrow(BadRequestException);
      expect(mockTts.synthesizePcm).not.toHaveBeenCalled();
    });

    it('should reject when session is not owned by the user', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);

      await expect(
        service.getQuestionAudio(SESSION_ID, userId, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getQuestionAudioStreamEvents', () => {
    const sessionWithQuestion = buildActiveSession({
      status: 'completed',
      messages: [
        {
          role: 'interviewer',
          content: '第一题：请介绍一下事件循环。',
          round: 1,
          kind: 'question',
        },
        { role: 'candidate', content: '我的回答', round: 1, kind: 'answer' },
      ],
    });

    beforeEach(() => {
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });
      mockTtsCacheModel.updateOne.mockResolvedValue({});
    });

    it('should replay cached audio as meta/chunk/done without calling upstream', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          audio: Buffer.from('cached-pcm'),
          mimeType: 'audio/pcm',
          sampleRate: 24000,
        }),
      });

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const events = await collectEvents(events$);

      expect(events.map((e) => e.type)).toEqual(['meta', 'chunk', 'done']);
      expect(events[0]).toMatchObject({ sampleRate: 24000, channels: 1 });
      expect(Buffer.from(events[1].data, 'base64').toString()).toBe(
        'cached-pcm',
      );
      expect(mockTts.synthesizeStream).not.toHaveBeenCalled();
      expect(mockTtsCacheModel.updateOne).not.toHaveBeenCalled();
    });

    it('should replay lean bson binary cache as chunk events (mongoose 9 lean returns Binary)', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          // mongoose 9 + bson 7：lean() 对 Buffer 字段返回 BSON Binary，
          // 其 length 是方法、无 subarray，直接重放会产出空流
          audio: new mongoose.mongo.Binary(Buffer.from('cached-pcm'), 0),
          mimeType: 'audio/pcm',
          sampleRate: 24000,
        }),
      });

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const events = await collectEvents(events$);

      expect(events.map((e) => e.type)).toEqual(['meta', 'chunk', 'done']);
      expect(Buffer.from(events[1].data, 'base64').toString()).toBe(
        'cached-pcm',
      );
    });

    it('should treat empty pcm cache as stale and re-synthesize', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          audio: Buffer.alloc(0),
          mimeType: 'audio/pcm',
          sampleRate: 24000,
        }),
      });
      mockTts.synthesizeStream.mockResolvedValue(
        makeTtsStreamHandle([Buffer.from('fresh-pcm')]),
      );

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const events = await collectEvents(events$);

      expect(mockTts.synthesizeStream).toHaveBeenCalled();
      expect(events.map((e) => e.type)).toEqual(['meta', 'chunk', 'done']);
    });

    it('should open the upstream only upon subscription', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizeStream.mockResolvedValue(
        makeTtsStreamHandle([Buffer.from('pcm')]),
      );

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      // 拿到 Observable 时尚未发起合成：客户端在等待期断开则零合成成本
      expect(mockTts.synthesizeStream).not.toHaveBeenCalled();

      await collectEvents(events$);

      expect(mockTts.synthesizeStream).toHaveBeenCalledWith(
        '第一题：请介绍一下事件循环。',
      );
    });

    it('should abort the handle when the subscriber cancels during upstream connect', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      let resolveConnect!: (handle: any) => void;
      const abort = jest.fn();
      mockTts.synthesizeStream.mockReturnValue(
        new Promise((resolve) => (resolveConnect = resolve)),
      );

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const subscription = events$.subscribe();
      // 建连 await 期间取消订阅：teardown 执行时句柄尚未创建
      subscription.unsubscribe();
      resolveConnect({
        meta: { sampleRate: 24000, channels: 1 },
        iterator: (async function* () {})(),
        abort,
      });
      // 让订阅回调的后续微任务执行完
      await new Promise((resolve) => setImmediate(resolve));

      // 句柄创建后必须立即中止，否则上游请求泄漏（继续产生合成费用）
      expect(abort).toHaveBeenCalled();
    });

    it('should abort upstream synthesis immediately when subscriber unsubscribes', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      let releaseIterator: (() => void) | undefined;
      const abort = jest.fn(() => releaseIterator?.());
      mockTts.synthesizeStream.mockResolvedValue({
        meta: { sampleRate: 24000, channels: 1 },
        iterator: (async function* () {
          yield Buffer.from('aa');
          // 模拟上游挂起：只有 abort 被调用后迭代才会继续
          await new Promise<void>((resolve) => {
            releaseIterator = resolve;
          });
        })(),
        abort,
      });

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const subscription = events$.subscribe();
      // 等待循环消费完第一块并挂起在上游等待中
      await new Promise((resolve) => setImmediate(resolve));
      subscription.unsubscribe();

      expect(abort).toHaveBeenCalled();
    });

    it('should stream synthesized chunks as events and persist pcm cache', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizeStream.mockResolvedValue(
        makeTtsStreamHandle([Buffer.from('aa'), Buffer.from('bb')]),
      );

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const events = await collectEvents(events$);

      expect(events.map((e) => e.type)).toEqual([
        'meta',
        'chunk',
        'chunk',
        'done',
      ]);
      expect(mockTtsCacheModel.updateOne).toHaveBeenCalledWith(
        { sessionId: expect.anything(), round: 1 },
        {
          $set: {
            sessionId: expect.anything(),
            round: 1,
            text: '第一题：请介绍一下事件循环。',
            audio: Buffer.from('aabb'),
            mimeType: 'audio/pcm',
            sampleRate: 24000,
          },
        },
        { upsert: true },
      );
    });

    it('should emit an error event when synthesis fails mid-stream', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesizeStream.mockResolvedValue({
        meta: { sampleRate: 24000, channels: 1 },
        iterator: (async function* () {
          yield Buffer.from('aa');
          throw new BadGatewayException('语音服务请求过于频繁，请稍后重试');
        })(),
        abort: jest.fn(),
      });

      const events$ = await service.getQuestionAudioStreamEvents(
        SESSION_ID,
        userId,
        1,
      );
      const events = await collectEvents(events$);

      expect(events.map((e) => e.type)).toEqual(['meta', 'chunk', 'error']);
      expect(events[2].message).toContain('过于频繁');
    });

    it('should reject synchronously when the round has no question', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);

      await expect(
        service.getQuestionAudioStreamEvents(SESSION_ID, userId, 9),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject synchronously when session is not owned', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);

      await expect(
        service.getQuestionAudioStreamEvents(SESSION_ID, userId, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('listSessions', () => {
    const buildFindChain = (list: any[] = []) => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(list),
      };
      mockSessionModel.find.mockReturnValue(chain);
      return chain;
    };

    it('should return paginated sessions with default page/pageSize', async () => {
      const chain = buildFindChain([
        { _id: 's2', status: 'completed' },
        { _id: 's1', status: 'cancelled' },
      ]);
      mockSessionModel.countDocuments.mockResolvedValue(2);

      const result = await service.listSessions(userId, {});

      expect(result).toEqual({
        list: [
          { _id: 's2', status: 'completed', hasReport: true },
          { _id: 's1', status: 'cancelled', hasReport: false },
        ],
        total: 2,
        page: 1,
        pageSize: 10,
      });
      expect(mockSessionModel.find).toHaveBeenCalledWith({
        userId: expect.anything(),
      });
      expect(chain.select).toHaveBeenCalledWith('-messages -report');
      expect(chain.sort).toHaveBeenCalledWith({ startedAt: -1 });
      expect(chain.skip).toHaveBeenCalledWith(0);
      expect(chain.limit).toHaveBeenCalledWith(10);
    });

    it('should apply status filter and pagination offsets', async () => {
      const chain = buildFindChain();
      mockSessionModel.countDocuments.mockResolvedValue(0);

      await service.listSessions(userId, {
        page: 3,
        pageSize: 5,
        status: InterviewStatusEnum.Completed,
      });

      expect(mockSessionModel.find).toHaveBeenCalledWith({
        userId: expect.anything(),
        status: InterviewStatusEnum.Completed,
      });
      expect(chain.skip).toHaveBeenCalledWith(10);
      expect(chain.limit).toHaveBeenCalledWith(5);
    });
  });
});

/** 构造一个假 TtsStream 句柄（默认 24000Hz / 单声道） */
function makeTtsStreamHandle(chunks: Buffer[], sampleRate = 24000) {
  return {
    meta: { sampleRate, channels: 1 },
    iterator: (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
    abort: jest.fn(),
  };
}

/** 订阅 Observable 并收集全部事件（供流式用例断言） */
function collectEvents(events$: Observable<any>): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const events: any[] = [];
    events$.subscribe({
      next: (event) => events.push(event),
      error: reject,
      complete: () => resolve(events),
    });
  });
}
