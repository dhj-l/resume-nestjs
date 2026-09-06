import { Test, TestingModule } from '@nestjs/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { QuestionEngineService } from './question-engine.service';
import {
  ExperienceLevelEnum,
  InterviewModeEnum,
  InterviewStageEnum,
} from '../constants/level.constants';
import type { InterviewMessage } from '../entities/interview-session.entity';
import {
  MessageKindEnum,
  MessageRoleEnum,
} from '../entities/interview-session.entity';

describe('QuestionEngineService - 出题引擎', () => {
  let service: QuestionEngineService;

  const mockAiService = {
    generateInterviewOutline: jest.fn(),
    generateInterviewQuestion: jest.fn(),
    generateInterviewSuggestions: jest.fn(),
    createRobustStructuredParser: jest.fn(),
  } as any;

  const levelConfig = {
    mode: InterviewModeEnum.Experienced,
    stage: InterviewStageEnum.First,
    experienceLevel: ExperienceLevelEnum.Mid,
  };

  const outline = [
    {
      key: 'self_intro',
      title: '自我介绍',
      questionType: 'self_intro',
    },
    {
      key: 'order_system_refactor',
      title: '订单系统重构',
      questionType: 'project',
    },
    {
      key: 'tcp_handshake',
      title: 'TCP 三次握手',
      questionType: 'fundamentals',
    },
  ];

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionEngineService,
        { provide: AiService, useValue: mockAiService },
      ],
    }).compile();
    service = module.get<QuestionEngineService>(QuestionEngineService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupModel = (mockFn: jest.Mock, outputs: Array<unknown | Error>) => {
    let attempts = 0;
    mockFn.mockImplementation(() =>
      RunnableLambda.from(async () => {
        const output = outputs[Math.min(attempts, outputs.length - 1)];
        attempts++;
        if (output instanceof Error) {
          throw output;
        }
        return JSON.stringify(output);
      }),
    );
    mockAiService.createRobustStructuredParser.mockReturnValue(
      RunnableLambda.from(async (input: any) =>
        typeof input === 'string' ? JSON.parse(input) : input,
      ),
    );
    return { getAttempts: () => attempts };
  };

  describe('generateOutline', () => {
    it('should generate an outline and normalize questionType', async () => {
      // AI 漏标题型 / 误标 reverse 时应被归一化；首主题强制 self_intro
      setupModel(mockAiService.generateInterviewOutline, [
        {
          topics: [
            { key: 'intro', title: '开场', questionType: 'reverse' },
            { key: 'legacy_project', title: '项目拆解' },
            {
              key: 'tcp',
              title: 'TCP',
              questionType: 'fundamentals',
            },
          ],
        },
      ]);

      const result = await service.generateOutline({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: { basicInfo: { name: '张三' } },
        levelConfig,
      });

      expect(result[0].questionType).toBe('self_intro');
      expect(result[1].questionType).toBe('project');
      expect(result[2].questionType).toBe('fundamentals');
    });

    it('should retry when AI returns empty topics then succeed', async () => {
      let attempts = 0;
      mockAiService.generateInterviewOutline.mockImplementation(() =>
        RunnableLambda.from(async () => {
          attempts++;
          return JSON.stringify(
            attempts === 1
              ? { topics: [] }
              : { topics: [{ key: 'a', title: '主题' }] },
          );
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (text: string) => JSON.parse(text)),
      );

      const result = await service.generateOutline({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: {},
        levelConfig,
      });
      expect(attempts).toBe(2);
      expect(result[0].questionType).toBe('self_intro');
    });

    it('should throw after exhausting retries', async () => {
      let attempts = 0;
      mockAiService.generateInterviewOutline.mockImplementation(() =>
        RunnableLambda.from(async () => {
          attempts++;
          return '{"topics":[]}';
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (text: string) => JSON.parse(text)),
      );

      await expect(
        service.generateOutline({
          jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
          resume: {},
          levelConfig,
        }),
      ).rejects.toThrow();
      // 首次 + 2 次重试
      expect(attempts).toBe(3);
    });
  });

  describe('generateTurn - 回合决策', () => {
    const messages: InterviewMessage[] = [
      {
        role: MessageRoleEnum.Interviewer,
        content: '请先简单介绍一下你在订单系统中承担的角色。',
        round: 1,
        kind: MessageKindEnum.Question,
      } as InterviewMessage,
      {
        role: MessageRoleEnum.Candidate,
        content: '我负责了订单系统的重构，用了分库分表……但没做量化统计。',
        round: 1,
        kind: MessageKindEnum.Answer,
      } as InterviewMessage,
    ];

    const validTurn = {
      feedback: {
        completeness: 70,
        logic: 85,
        depth: 55,
        comment: '讲清了方案，缺少量化数据',
      },
      topicKey: 'order_system_refactor',
      question: '重构后 QPS 提升了多少？',
      questionType: 'project',
      isFollowUp: true,
      shouldEndMainPhase: false,
    };

    it('should return the turn decision with feedback', async () => {
      setupModel(mockAiService.generateInterviewQuestion, [validTurn]);

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: ['self_intro'],
        elapsedMinutes: 12,
        askedCount: 2,
        endPolicy: 'cannot_end',
      });

      expect(result.feedback.completeness).toBe(70);
      expect(result.isFollowUp).toBe(true);
      expect(result.topicKey).toBe('order_system_refactor');
    });

    it('should inject elapsed time, asked count and end policy into the prompt', async () => {
      let capturedPrompt = '';
      mockAiService.generateInterviewQuestion.mockImplementation(() =>
        RunnableLambda.from(async (promptValue: { toString(): string }) => {
          capturedPrompt = String(promptValue);
          return JSON.stringify(validTurn);
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (input: any) =>
          typeof input === 'string' ? JSON.parse(input) : input,
        ),
      );

      await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: [],
        elapsedMinutes: 35,
        askedCount: 16,
        endPolicy: 'can_end',
      });

      expect(capturedPrompt).toContain('已进行 35 分钟');
      expect(capturedPrompt).toContain('已提问 16 个问题');
      expect(capturedPrompt).toContain('可以结束');
    });

    it('should describe the must_end policy as mandatory transition', async () => {
      let capturedPrompt = '';
      mockAiService.generateInterviewQuestion.mockImplementation(() =>
        RunnableLambda.from(async (promptValue: { toString(): string }) => {
          capturedPrompt = String(promptValue);
          return JSON.stringify({
            ...validTurn,
            question: '今天的面试就到这里，你有什么想问我的吗？',
            questionType: 'reverse',
            shouldEndMainPhase: true,
          });
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (input: any) =>
          typeof input === 'string' ? JSON.parse(input) : input,
        ),
      );

      await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: [],
        elapsedMinutes: 62,
        askedCount: 18,
        endPolicy: 'must_end',
      });

      expect(capturedPrompt).toContain('必须结束');
    });

    it('should pass remaining topics excluding already asked ones', async () => {
      let capturedPrompt = '';
      setupModelPromptCapture(
        mockAiService.generateInterviewQuestion,
        (p) => {
          capturedPrompt = p;
        },
        validTurn,
      );

      await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: ['self_intro', 'order_system_refactor'],
        elapsedMinutes: 10,
        askedCount: 3,
        endPolicy: 'cannot_end',
      });

      // 已考察主题不应出现在"尚未覆盖主题"中
      const remainingSection = capturedPrompt.split('## 尚未覆盖的主题')[1];
      expect(remainingSection).toContain('tcp_handshake');
      expect(
        remainingSection
          .slice(0, remainingSection.indexOf('##'))
          .includes('order_system_refactor'),
      ).toBe(false);
    });

    it('should tell the model to improvise beyond the outline instead of sending an empty array', async () => {
      let capturedPrompt = '';
      setupModelPromptCapture(
        mockAiService.generateInterviewQuestion,
        (p) => {
          capturedPrompt = p;
        },
        validTurn,
      );

      await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: outline.map((topic) => topic.key),
        elapsedMinutes: 20,
        askedCount: 15,
        endPolicy: 'cannot_end',
      });

      const remainingSection = capturedPrompt.split('## 尚未覆盖的主题')[1];
      expect(
        remainingSection.slice(0, remainingSection.indexOf('##')).trim(),
      ).toContain('自主出题');
      expect(
        remainingSection.slice(0, remainingSection.indexOf('##')),
      ).not.toContain('[]');
    });

    it('should reject a decision without feedback', async () => {
      setupModel(mockAiService.generateInterviewQuestion, [
        { topicKey: 'a', question: '下一题？', isFollowUp: false },
      ]);

      await expect(
        service.generateTurn({
          jobDescription: '负责后端服务开发',
          resume: {},
          levelConfig,
          outline,
          messages,
          askedTopicKeys: [],
          elapsedMinutes: 10,
          askedCount: 3,
          endPolicy: 'cannot_end',
        }),
      ).rejects.toThrow('回合决策');
    });

    it('should retry a decision that omits topicKey while continuing the interview', async () => {
      // 出题/追问必须携带 topicKey，否则主题覆盖追踪（askedTopicKeys）出现缺口；
      // 缺失应触发校验重试而不是静默通过
      const { getAttempts } = setupModel(
        mockAiService.generateInterviewQuestion,
        [{ ...validTurn, topicKey: undefined }, validTurn],
      );

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: [],
        elapsedMinutes: 10,
        askedCount: 3,
        endPolicy: 'cannot_end',
      });

      expect(getAttempts()).toBe(2);
      expect(result.topicKey).toBe('order_system_refactor');
    });

    it('should retry a compound question with multiple question marks', async () => {
      // 一轮连环问会让候选人无法逐点作答，必须触发重试让模型改为一次只问一个问题
      const { getAttempts } = setupModel(
        mockAiService.generateInterviewQuestion,
        [
          {
            ...validTurn,
            question:
              'ref 和 reactive 的本质区别是什么？为何 ref 要设计成 .value 访问？',
          },
          validTurn,
        ],
      );

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: [],
        elapsedMinutes: 10,
        askedCount: 3,
        endPolicy: 'cannot_end',
      });

      expect(getAttempts()).toBe(2);
      expect(result.question).toBe('重构后 QPS 提升了多少？');
    });

    it('should not treat optional chaining or nullish operators as extra questions', async () => {
      // a?.b 与 a ?? b 是 JS 运算符，不应被问号计数误判为连环问
      const question =
        '请说说 a?.b 与 a ?? b 这两个写法在运行时的行为有什么区别？';
      setupModel(mockAiService.generateInterviewQuestion, [
        { ...validTurn, question },
      ]);

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: [],
        elapsedMinutes: 10,
        askedCount: 3,
        endPolicy: 'cannot_end',
      });

      expect(result.question).toBe(question);
    });

    it('should accept a closing decision without topicKey', async () => {
      // 收尾语（shouldEndMainPhase=true）没有考察主题，无需 topicKey
      setupModel(mockAiService.generateInterviewQuestion, [
        {
          ...validTurn,
          topicKey: undefined,
          questionType: 'reverse',
          question: '今天聊得很好，你有什么想问我的吗？',
          shouldEndMainPhase: true,
        },
      ]);

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: [],
        elapsedMinutes: 35,
        askedCount: 16,
        endPolicy: 'can_end',
      });

      expect(result.shouldEndMainPhase).toBe(true);
      expect(result.topicKey).toBeUndefined();
    });
  });

  describe('generateReverseResponse - 反问环节', () => {
    it('should return the interviewer response and continue flag', async () => {
      setupModel(mockAiService.generateInterviewQuestion, [
        {
          response: '团队目前 12 个人，你还有什么想了解的吗？',
          continueReverse: true,
        },
      ]);

      const result = await service.generateReverseResponse({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        messages: [
          {
            role: MessageRoleEnum.Candidate,
            content: '想了解一下团队现在有多少人？',
            round: 2,
            kind: MessageKindEnum.Answer,
            questionType: 'reverse',
          } as InterviewMessage,
        ],
        reverseCount: 1,
      });

      expect(result.continueReverse).toBe(true);
      expect(result.response).toContain('12 个人');
    });

    it('should inject the experience level into the reverse prompt like the other chains', async () => {
      // 与大纲/回合决策/反问建议链保持同一套变量，避免副本间行为分叉
      let capturedPrompt = '';
      setupModelPromptCapture(
        mockAiService.generateInterviewQuestion,
        (p) => {
          capturedPrompt = p;
        },
        { response: '好的', continueReverse: true },
      );

      await service.generateReverseResponse({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        messages: [],
        reverseCount: 1,
      });

      expect(capturedPrompt).toContain('经验层级：1-3 年经验');
    });

    it('should retry after an empty response then succeed', async () => {
      setupModel(mockAiService.generateInterviewQuestion, [
        { response: '', continueReverse: true },
        { response: '好的，感谢参加。', continueReverse: false },
      ]);

      const result = await service.generateReverseResponse({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        messages: [],
        reverseCount: 1,
      });

      expect(result.continueReverse).toBe(false);
      expect(result.response).toContain('感谢');
    });
  });

  describe('generateReverseSuggestions - 反问建议', () => {
    it('should return suggestions list', async () => {
      setupModel(mockAiService.generateInterviewSuggestions, [
        {
          suggestions: [
            { title: '团队技术栈', content: '想了解团队核心的技术栈？' },
            { title: '成长路径', content: '新人的成长路径是怎样的？' },
            { title: '业务挑战', content: '业务目前最大的挑战是什么？' },
          ],
        },
      ]);

      const result = await service.generateReverseSuggestions({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        messages: [],
      });

      expect(result).toHaveLength(3);
      expect(result[0].title).toBe('团队技术栈');
    });

    it('should throw after exhausting retries with empty suggestions', async () => {
      let attempts = 0;
      mockAiService.generateInterviewSuggestions.mockImplementation(() =>
        RunnableLambda.from(async () => {
          attempts++;
          return '{"suggestions":[]}';
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (input: any) =>
          typeof input === 'string' ? JSON.parse(input) : input,
        ),
      );

      await expect(
        service.generateReverseSuggestions({
          jobDescription: '负责后端服务开发',
          resume: {},
          levelConfig,
          messages: [],
        }),
      ).rejects.toThrow();
      expect(attempts).toBe(3);
    });
  });

  /** 捕获送入模型的 prompt 便于断言模板变量 */
  function setupModelPromptCapture(
    mockFn: jest.Mock,
    capture: (prompt: string) => void,
    output: unknown,
  ) {
    mockFn.mockImplementation(() =>
      RunnableLambda.from(async (promptValue: { toString(): string }) => {
        capture(String(promptValue));
        return JSON.stringify(output);
      }),
    );
    mockAiService.createRobustStructuredParser.mockReturnValue(
      RunnableLambda.from(async (input: any) =>
        typeof input === 'string' ? JSON.parse(input) : input,
      ),
    );
  }
});
