import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { DocumentParserService } from './document-parser.service';
import { ResumeAiService } from './resume-ai.service';
import {
  ANSWER_TEXT_MAX,
  InterviewQuestionSchema,
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
  QUESTION_TEXT_MAX,
  normalizeInterviewQuestions,
} from './schemas/question.schema';
import { QuestionStatusEnum } from './entities/resume-question-record.entity';

describe('ResumeQuestionRecord - 面试押题', () => {
  let service: ResumeAiService;

  const mockResumeAiModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
  } as any;

  const mockResumeModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  } as any;

  const mockEditRecordModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    findByIdAndDelete: jest.fn(),
  } as any;

  const mockAnalysisRecordModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  } as any;

  const mockQuestionRecordModel = {
    create: jest.fn(),
    findOne: jest.fn(),
    updateMany: jest.fn(),
    findByIdAndUpdate: jest.fn(),
    find: jest.fn(),
    countDocuments: jest.fn(),
  } as any;

  const mockAiUsageRecordModel = {
    create: jest.fn(),
  } as any;

  const mockAiService = {
    generateInterviewQuestions: jest.fn(),
    createRobustStructuredParser: jest.fn(),
  } as any;

  const mockDocumentParserService = {
    parseDocument: jest.fn(),
  };

  const validJd = `前端开发工程师（Agent 方向）
工作地点：上海
公司介绍：某互联网公司，专注于 AI 与数据平台产品研发。
职位描述
1、负责 Web 前端与 Agent 应用的全栈研发，覆盖 Node/BFF 与服务端接口；
2、参与 Prompt Engineering、Workflow、Multi-Agent、Tool Calling 等方向建设；
3、持续进行性能优化和架构升级，支撑内部业务及商业化客户需求。
任职要求
1、本科及以上学历，计算机相关专业；
2、扎实的前端基础，熟悉 HTML、CSS、JavaScript/TypeScript 与 HTTP 协议；
3、掌握 Python、Java、Go、Node.js 中至少一种服务端语言；
4、学习能力强，具有良好团队合作精神和沟通能力。
加分项：对大模型与 Agent 有真实动手经验，做过基于大模型 API、Agent 框架相关的项目。`;

  const resumeDoc = {
    _id: 'resume-1',
    basicInfo: { name: '张三', phone: '13800138000', workYear: '3年' },
    jobIntention: { jobIntention: '前端开发工程师' },
    educationBackground: [{ school: '上海交通大学', degree: '本科' }],
    workExperience: [],
    projectExperience: [],
    skills: { content: 'Vue3, TypeScript' },
    certificates: { content: '' },
    selfEvaluation: { content: '' },
    campusExperience: [],
    internshipExperience: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResumeAiService,
        { provide: 'ResumeAiModel', useValue: mockResumeAiModel },
        { provide: 'ResumeModel', useValue: mockResumeModel },
        { provide: 'ResumeEditRecordModel', useValue: mockEditRecordModel },
        {
          provide: 'ResumeAnalysisRecordModel',
          useValue: mockAnalysisRecordModel,
        },
        {
          provide: 'ResumeQuestionRecordModel',
          useValue: mockQuestionRecordModel,
        },
        { provide: 'AiUsageRecordModel', useValue: mockAiUsageRecordModel },
        { provide: AiService, useValue: mockAiService },
        {
          provide: DocumentParserService,
          useValue: mockDocumentParserService,
        },
      ],
    }).compile();

    service = module.get<ResumeAiService>(ResumeAiService);
  });

  describe('InterviewQuestionSchema', () => {
    const buildQuestions = (count: number, overLength = false) => ({
      questions: Array.from({ length: count }, (_, index) => ({
        question: `题目${index}${overLength ? '很'.repeat(QUESTION_TEXT_MAX) : ''}`,
        answer: `解答${index}${overLength ? '很'.repeat(ANSWER_TEXT_MAX) : ''}`,
        category: '技术',
        difficulty: '基础',
      })),
    });

    const buildExtended = (
      item: Record<string, unknown> = {},
      top: Record<string, unknown> = {},
    ) => ({
      ...top,
      questions: Array.from({ length: QUESTION_COUNT_MIN }, (_, index) => ({
        question: `q${index}`,
        answer: `a${index}`,
        ...item,
      })),
    });

    it('接受 8-15 道合法题目', () => {
      expect(
        InterviewQuestionSchema.parse(buildQuestions(QUESTION_COUNT_MIN))
          .questions,
      ).toHaveLength(QUESTION_COUNT_MIN);
      expect(
        InterviewQuestionSchema.parse(buildQuestions(QUESTION_COUNT_MAX))
          .questions,
      ).toHaveLength(QUESTION_COUNT_MAX);
    });

    it('拒绝少于 8 道或超过 15 道', () => {
      expect(() =>
        InterviewQuestionSchema.parse(buildQuestions(QUESTION_COUNT_MIN - 1)),
      ).toThrow();
      expect(() =>
        InterviewQuestionSchema.parse(buildQuestions(QUESTION_COUNT_MAX + 1)),
      ).toThrow();
    });

    it('拒绝题目超过 80 字或解答超过 250 字', () => {
      expect(() =>
        InterviewQuestionSchema.parse(buildQuestions(QUESTION_COUNT_MIN, true)),
      ).toThrow();
    });

    it('接受扩展字段（keywords/followUp/evaluationPoint 与记录级汇总）', () => {
      const parsed = InterviewQuestionSchema.parse(
        buildExtended(
          {
            keywords: ['Vue3'],
            followUp: '如何验证优化效果？',
            evaluationPoint: '考察响应式原理理解',
          },
          {
            overview: '综合押题说明',
            focusAreas: [{ area: 'Vue3 原理', reason: '核心技能' }],
            hotTopics: ['AI 工程化'],
            interviewTips: ['用 STAR 答题'],
          },
        ),
      );
      expect(parsed.questions).toHaveLength(QUESTION_COUNT_MIN);
      expect(parsed.questions[0].keywords).toEqual(['Vue3']);
      expect(parsed.overview).toBe('综合押题说明');
    });

    it('拒绝超限的扩展字段', () => {
      expect(() =>
        InterviewQuestionSchema.parse(
          buildExtended({ keywords: ['很'.repeat(21)] }),
        ),
      ).toThrow();
      expect(() =>
        InterviewQuestionSchema.parse(
          buildExtended({ followUp: '很'.repeat(61) }),
        ),
      ).toThrow();
      expect(() =>
        InterviewQuestionSchema.parse(
          buildExtended({}, { overview: '很'.repeat(201) }),
        ),
      ).toThrow();
    });
  });

  describe('normalizeInterviewQuestions', () => {
    it('trim 字段并丢弃空 category/difficulty', () => {
      const normalized = normalizeInterviewQuestions(
        {
          questions: [
            {
              question: ' 请描述你的核心项目 ',
              answer: ' 要点一；要点二 ',
              category: ' 技术 ',
              difficulty: '',
            },
          ],
        },
        1,
      );
      expect(normalized.questions).toEqual([
        {
          question: '请描述你的核心项目',
          answer: '要点一；要点二',
          category: '技术',
        },
      ]);
    });

    it('归一化扩展字段并返回记录级汇总', () => {
      const normalized = normalizeInterviewQuestions(
        {
          overview: ' 综合押题说明 ',
          focusAreas: [
            { area: ' Vue3 原理 ', reason: ' 简历核心技能，高频追问 ' },
            { area: '', reason: ' 空方向应被过滤 ' },
          ],
          hotTopics: [' AI 工程化 ', ' 性能优化 '],
          interviewTips: [' 用 STAR 组织项目回答 '],
          questions: [
            {
              question: 'q1',
              answer: 'a1',
              keywords: [' Vue3 响应式 ', '', ' 性能优化 '],
              followUp: ' 如何验证优化效果？ ',
              evaluationPoint: ' 考察响应式原理理解 ',
            },
          ],
        },
        1,
      );
      expect(normalized).toEqual({
        overview: '综合押题说明',
        focusAreas: [{ area: 'Vue3 原理', reason: '简历核心技能，高频追问' }],
        hotTopics: ['AI 工程化', '性能优化'],
        interviewTips: ['用 STAR 组织项目回答'],
        questions: [
          {
            question: 'q1',
            answer: 'a1',
            keywords: ['Vue3 响应式', '性能优化'],
            followUp: '如何验证优化效果？',
            evaluationPoint: '考察响应式原理理解',
          },
        ],
      });
    });

    it('数量与 questionCount 不符时抛错', () => {
      expect(() =>
        normalizeInterviewQuestions(
          {
            questions: [
              { question: 'q1', answer: 'a1' },
              { question: 'q2', answer: 'a2' },
            ],
          },
          10,
        ),
      ).toThrow('押题数量不符');
    });

    it('空题目或超长解答抛错', () => {
      expect(() =>
        normalizeInterviewQuestions(
          { questions: [{ question: '', answer: 'a' }] },
          1,
        ),
      ).toThrow('存在空题目');
      expect(() =>
        normalizeInterviewQuestions(
          {
            questions: [
              { question: 'q', answer: '很'.repeat(ANSWER_TEXT_MAX + 1) },
            ],
          },
          1,
        ),
      ).toThrow('字上限');
    });
  });

  describe('predictInterviewQuestions', () => {
    const dto = {
      resumeId: 'resume-1',
      jobDescription: validJd,
      questionCount: 10,
    };

    const makeQuestions = (count: number) => ({
      questions: Array.from({ length: count }, (_, index) => ({
        question: `题目${index}`,
        answer: `解答${index}`,
        category: '技术',
        difficulty: '基础',
      })),
    });

    const makeRichResult = () => ({
      overview: '综合押题说明',
      focusAreas: [{ area: 'Vue3 原理', reason: '简历核心技能，高频追问' }],
      hotTopics: ['AI 工程化', '性能优化'],
      interviewTips: ['用 STAR 组织项目回答'],
      questions: Array.from({ length: 10 }, (_, index) => ({
        question: `题目${index}`,
        answer: `解答${index}`,
        category: '技术',
        difficulty: '基础',
        keywords: [`关键词${index}`],
        followUp: `追问${index}`,
        evaluationPoint: `考察点${index}`,
      })),
    });

    const mockOkModel = (questions: unknown) =>
      RunnableLambda.from(async () => JSON.stringify(questions));
    const mockJsonParser = () =>
      RunnableLambda.from(async (text: string) => JSON.parse(text));

    beforeEach(() => {
      (mockResumeModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(resumeDoc),
      });
      (mockQuestionRecordModel.findOne as jest.Mock).mockResolvedValue(null);
      (mockQuestionRecordModel.updateMany as jest.Mock).mockResolvedValue({});
      (mockQuestionRecordModel.create as jest.Mock).mockResolvedValue({
        _id: 'record-1',
      });
      (
        mockQuestionRecordModel.findByIdAndUpdate as jest.Mock
      ).mockResolvedValue({});
      (mockAiUsageRecordModel.create as jest.Mock).mockResolvedValue({});
      jest.spyOn(service as any, 'sleep').mockResolvedValue(undefined);
    });

    it('成功生成时落库 completed 并返回 recordId + result', async () => {
      mockAiService.generateInterviewQuestions = jest
        .fn()
        .mockReturnValue(mockOkModel(makeRichResult()));
      mockAiService.createRobustStructuredParser = jest
        .fn()
        .mockReturnValue(mockJsonParser());

      const result = await service.predictInterviewQuestions(dto, 'user-1');

      expect(mockQuestionRecordModel.create).toHaveBeenCalledWith({
        resumeId: 'resume-1',
        jobDescription: validJd,
        questionCount: 10,
        candidateName: '张三',
        targetPosition: '前端开发工程师',
        workYears: '3年',
        status: QuestionStatusEnum.Generating,
        userId: 'user-1',
      });
      expect(mockQuestionRecordModel.findByIdAndUpdate).toHaveBeenCalledWith(
        'record-1',
        expect.objectContaining({
          status: QuestionStatusEnum.Completed,
          result: expect.any(Array),
          overview: '综合押题说明',
          focusAreas: expect.any(Array),
          hotTopics: expect.any(Array),
          interviewTips: expect.any(Array),
        }),
      );
      expect(result.recordId).toBe('record-1');
      expect(result.result).toHaveLength(10);
      expect(result.overview).toBe('综合押题说明');
      expect(result.result[0].keywords).toEqual(['关键词0']);
      expect(result.result[0].followUp).toBe('追问0');
      expect(result.result[0].evaluationPoint).toBe('考察点0');
      expect(mockAiUsageRecordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          aiFunction: 'interview_question_prediction',
          success: true,
        }),
      );
    });

    it('题目数量不符时重试，第二次成功', async () => {
      mockAiService.generateInterviewQuestions = jest
        .fn()
        .mockReturnValueOnce(mockOkModel(makeQuestions(9)))
        .mockReturnValueOnce(mockOkModel(makeQuestions(10)));
      mockAiService.createRobustStructuredParser = jest
        .fn()
        .mockReturnValue(mockJsonParser());

      const result = await service.predictInterviewQuestions(dto, 'user-1');

      expect(mockAiService.generateInterviewQuestions).toHaveBeenCalledTimes(2);
      expect(result.result).toHaveLength(10);
    });

    it('解答超长时重试，第二次成功', async () => {
      const overLength = makeQuestions(10);
      overLength.questions[0].answer = '很'.repeat(ANSWER_TEXT_MAX + 1);
      mockAiService.generateInterviewQuestions = jest
        .fn()
        .mockReturnValueOnce(mockOkModel(overLength))
        .mockReturnValueOnce(mockOkModel(makeQuestions(10)));
      mockAiService.createRobustStructuredParser = jest
        .fn()
        .mockReturnValue(mockJsonParser());

      const result = await service.predictInterviewQuestions(dto, 'user-1');

      expect(mockAiService.generateInterviewQuestions).toHaveBeenCalledTimes(2);
      expect(result.result).toHaveLength(10);
    });

    it('已存在进行中的押题任务时拦截', async () => {
      (mockQuestionRecordModel.findOne as jest.Mock).mockResolvedValue({
        _id: 'running-record',
      });

      await expect(
        service.predictInterviewQuestions(dto, 'user-1'),
      ).rejects.toThrow(BadRequestException);
      expect(mockQuestionRecordModel.create).not.toHaveBeenCalled();
    });

    it('简历不存在时抛错', async () => {
      (mockResumeModel.findOne as jest.Mock).mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.predictInterviewQuestions(dto, 'user-1'),
      ).rejects.toThrow('简历不存在');
    });

    it('题目数量越界时抛错', async () => {
      await expect(
        service.predictInterviewQuestions(
          { ...dto, questionCount: QUESTION_COUNT_MIN - 1 },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.predictInterviewQuestions(
          { ...dto, questionCount: QUESTION_COUNT_MAX + 1 },
          'user-1',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('全部重试失败时记录 failed 并抛错', async () => {
      mockAiService.generateInterviewQuestions = jest.fn().mockReturnValue(
        RunnableLambda.from(async () => {
          throw new Error('模型调用失败');
        }),
      );
      mockAiService.createRobustStructuredParser = jest
        .fn()
        .mockReturnValue(mockJsonParser());

      await expect(
        service.predictInterviewQuestions(dto, 'user-1'),
      ).rejects.toThrow(BadRequestException);

      const lastUpdate = (
        mockQuestionRecordModel.findByIdAndUpdate as jest.Mock
      ).mock.calls.at(-1);
      expect(lastUpdate?.[1]).toEqual(
        expect.objectContaining({
          status: QuestionStatusEnum.Failed,
          failReason: expect.any(String),
        }),
      );
      expect(mockAiUsageRecordModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          aiFunction: 'interview_question_prediction',
          success: false,
        }),
      );
    });
  });

  describe('押题记录查询', () => {
    it('getQuestionRecords 返回分页列表', async () => {
      (mockQuestionRecordModel.find as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([{ _id: 'record-1' }]),
      });
      (mockQuestionRecordModel.countDocuments as jest.Mock).mockResolvedValue(
        1,
      );

      const result = await service.getQuestionRecords('user-1', 1, 10);

      expect(result.total).toBe(1);
      expect(result.list).toHaveLength(1);
      expect(mockQuestionRecordModel.find).toHaveBeenCalledWith({
        userId: 'user-1',
      });
    });

    it('getQuestionDetailService 记录不存在时抛错', async () => {
      (mockQuestionRecordModel.findOne as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getQuestionDetailService('record-1', 'user-1'),
      ).rejects.toThrow('查询不到对应的押题数据');
    });

    it('getLatestQuestionsByResumeId 返回最新记录', async () => {
      (mockQuestionRecordModel.findOne as jest.Mock).mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue({ _id: 'record-latest' }),
      });

      const result = await service.getLatestQuestionsByResumeId(
        'resume-1',
        'user-1',
      );
      expect(result).toEqual({ _id: 'record-latest' });
    });
  });
});
