import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { EvaluationService } from './services/evaluation.service';
import { QuestionEngineService } from './services/question-engine.service';
import { TtsService } from 'src/ai/tts.service';
import { InterviewService } from './interview.service';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
  InterviewStatusEnum,
} from './constants/level.constants';

describe('InterviewService - 模拟面试编排', () => {
  let service: InterviewService;

  const mockSessionModel = {
    create: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    updateMany: jest.fn(),
  } as any;

  const mockResumeModel = {
    findOne: jest.fn(),
  } as any;

  const mockEngine = {
    generateOutline: jest.fn(),
    generateNextQuestion: jest.fn(),
    resolveTargetRounds: jest.fn().mockReturnValue(8),
  } as any;

  const mockEvaluation = {
    generateReport: jest.fn(),
  } as any;

  const mockTts = {
    synthesize: jest.fn(),
  } as any;

  const mockTtsCacheModel = {
    findOne: jest.fn(),
    updateOne: jest.fn(),
  } as any;

  const userId = 'user-1';
  const SESSION_ID = '507f1f77bcf86cd799439011';
  const levelConfig = {
    experienceLevel: ExperienceLevelEnum.Mid,
    focus: InterviewFocusEnum.Technical,
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
    targetRounds: 8,
    currentRound: 1,
    outline: [{ key: 'topic-a', title: '主题A' }],
    askedTopicKeys: ['topic-a'],
    messages: [],
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
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
    it('should create a session with outline and first question', async () => {
      const outline = [{ key: 'topic-a', title: '主题A' }];
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockSessionModel.findOne.mockResolvedValue(null);
      mockEngine.generateOutline.mockResolvedValue(outline);
      mockEngine.generateNextQuestion.mockResolvedValue({
        topicKey: 'topic-a',
        question: '第一题：请介绍一下事件循环。',
        isFollowUp: false,
      });
      const created = { _id: SESSION_ID, currentRound: 1 };
      mockSessionModel.create.mockResolvedValue(created);

      const result = await service.createSession(createDto, userId);

      expect(result).toEqual(created);
      expect(mockEngine.generateOutline).toHaveBeenCalledWith(
        expect.objectContaining({ levelConfig }),
      );
      expect(mockSessionModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          targetRounds: 8,
          outline,
          askedTopicKeys: ['topic-a'],
          messages: [
            expect.objectContaining({
              content: '第一题：请介绍一下事件循环。',
              round: 1,
            }),
          ],
        }),
      );
      // 过期时间应已设置
      expect(mockSessionModel.create.mock.calls[0][0].expiresAt).toBeInstanceOf(
        Date,
      );
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

    it('should map duplicate key error to conflict on concurrent creation', async () => {
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockSessionModel.findOne.mockResolvedValue(null);
      mockEngine.generateOutline.mockResolvedValue([]);
      mockEngine.generateNextQuestion.mockResolvedValue({
        topicKey: 't',
        question: 'q',
      });
      mockSessionModel.create.mockRejectedValue({ code: 11000 });

      await expect(service.createSession(createDto, userId)).rejects.toThrow(
        ConflictException,
      );
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
      mockSessionModel.findByIdAndUpdate.mockResolvedValue(expired);

      const result = await service.getCurrentSession(userId);

      // 超时会话应被关闭并返回（前端据此提示"上次面试因超时已关闭"）
      expect(result!.status).toBe('cancelled');
      expect(result!.endedReason).toBe('timeout');
      expect(mockSessionModel.findByIdAndUpdate).toHaveBeenCalledWith(
        SESSION_ID,
        expect.anything(),
      );
    });
  });

  describe('submitAnswer', () => {
    const answerDto = { content: '我的回答是……' };

    it('should return the next question and advance the round', async () => {
      const session = buildActiveSession({ currentRound: 2 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({}),
      }));
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateNextQuestion.mockResolvedValue({
        topicKey: 'topic-b',
        question: '下一题：讲讲索引原理。',
        isFollowUp: false,
      });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(result.nextQuestion).toBe('下一题：讲讲索引原理。');
      expect(result.round).toBe(3);
      // 新主题应被记录到 askedTopicKeys
      const updateCall = mockSessionModel.findByIdAndUpdate.mock.calls.find(
        ([, update]) => update?.$set?.askedTopicKeys,
      );
      expect(updateCall![1].$set.askedTopicKeys).toEqual([
        'topic-a',
        'topic-b',
      ]);
    });

    it('should auto-complete with report at target rounds', async () => {
      const session = buildActiveSession({
        currentRound: 8,
        targetRounds: 8,
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({}),
      }));
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 80 });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(true);
      expect(mockEvaluation.generateReport).toHaveBeenCalledTimes(1);
      expect(mockEngine.generateNextQuestion).not.toHaveBeenCalled();
    });

    it('should finish early when AI suggests ending past minimum rounds', async () => {
      const session = buildActiveSession({ currentRound: 4 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({}),
      }));
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateNextQuestion.mockResolvedValue({
        topicKey: 'topic-b',
        question: '……',
        shouldEndInterview: true,
      });
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 60 });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(true);
      expect(result.endedReason).toBe('ai_suggest');
    });

    it('should ignore AI end suggestion before minimum rounds', async () => {
      const session = buildActiveSession({ currentRound: 1 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({}),
      }));
      mockResumeModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      mockEngine.generateNextQuestion.mockResolvedValue({
        topicKey: 'topic-b',
        question: '继续提问',
        shouldEndInterview: true,
      });

      const result = await service.submitAnswer(session._id, answerDto, userId);

      expect(result.finished).toBe(false);
      expect(mockEvaluation.generateReport).not.toHaveBeenCalled();
    });

    it('should reject with conflict when session has timed out', async () => {
      const session = buildActiveSession({
        expiresAt: new Date(Date.now() - 1000),
      });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({}),
      }));

      await expect(
        service.submitAnswer(SESSION_ID, answerDto, userId),
      ).rejects.toThrow(ConflictException);
      expect(mockEngine.generateNextQuestion).not.toHaveBeenCalled();
    });

    it('should reject when session is already ended', async () => {
      const session = buildActiveSession({ status: 'completed' });
      mockSessionModel.findOne.mockResolvedValue(session);

      await expect(
        service.submitAnswer(SESSION_ID, answerDto, userId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cancelSession / finishSession', () => {
    it('should cancel without calling AI or generating a report', async () => {
      const session = buildActiveSession();
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockReturnValue({
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
      expect(mockEngine.generateNextQuestion).not.toHaveBeenCalled();
    });

    it('should finish with report on explicit finish', async () => {
      const session = buildActiveSession({ currentRound: 3 });
      mockSessionModel.findOne.mockResolvedValue(session);
      mockSessionModel.findByIdAndUpdate.mockImplementation(() => ({
        lean: () => Promise.resolve({}),
      }));
      mockEvaluation.generateReport.mockResolvedValue({ overallScore: 70 });

      await service.finishSession(SESSION_ID, userId);

      expect(mockEvaluation.generateReport).toHaveBeenCalledTimes(1);
      // 报告应使用当前已有的全部对话
      expect(mockEvaluation.generateReport.mock.calls[0][0].messages).toBe(
        session.messages,
      );
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

    it('should synthesize audio for the question of the given round', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesize.mockResolvedValue({
        buffer: Buffer.from('wav-bytes'),
        mimeType: 'audio/wav',
      });

      const result = await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(result.mimeType).toBe('audio/wav');
      expect(mockTts.synthesize).toHaveBeenCalledWith(
        '第一题：请介绍一下事件循环。',
      );
    });

    it('should return cached audio without calling tts again', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTtsCacheModel.findOne.mockReturnValue({
        lean: jest.fn().mockResolvedValue({
          audio: Buffer.from('cached-wav'),
          mimeType: 'audio/wav',
        }),
      });

      const result = await service.getQuestionAudio(SESSION_ID, userId, 1);

      expect(result.buffer.toString()).toBe('cached-wav');
      expect(mockTts.synthesize).not.toHaveBeenCalled();
      expect(mockTtsCacheModel.updateOne).not.toHaveBeenCalled();
    });

    it('should upsert synthesized audio into the cache', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      const wav = Buffer.from('fresh-wav');
      mockTts.synthesize.mockResolvedValue({
        buffer: wav,
        mimeType: 'audio/wav',
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
            audio: wav,
            mimeType: 'audio/wav',
          },
        },
        { upsert: true },
      );
    });

    it('should still return audio when caching fails', async () => {
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesize.mockResolvedValue({
        buffer: Buffer.from('wav-bytes'),
        mimeType: 'audio/wav',
      });
      mockTtsCacheModel.updateOne.mockRejectedValue(new Error('dup key'));

      await expect(
        service.getQuestionAudio(SESSION_ID, userId, 1),
      ).resolves.toEqual({
        buffer: Buffer.from('wav-bytes'),
        mimeType: 'audio/wav',
      });
    });

    it('should stay available for ended sessions (replay)', async () => {
      // 会话已 completed，回放场景仍可获取历史问题语音
      mockSessionModel.findOne.mockResolvedValue(sessionWithQuestion);
      mockTts.synthesize.mockResolvedValue({
        buffer: Buffer.from('wav'),
        mimeType: 'audio/wav',
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
      expect(mockTts.synthesize).not.toHaveBeenCalled();
    });

    it('should reject when session is not owned by the user', async () => {
      mockSessionModel.findOne.mockResolvedValue(null);

      await expect(
        service.getQuestionAudio(SESSION_ID, userId, 1),
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
