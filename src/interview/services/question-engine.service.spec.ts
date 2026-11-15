import { Test, TestingModule } from '@nestjs/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { QuestionEngineService } from './question-engine.service';
import {
  ExperienceLevelEnum,
  InterviewModeEnum,
  InterviewStageEnum,
  MIN_MAIN_DURATION_MS,
  QuestionTypeEnum,
  SOFT_MAX_MAIN_QUESTIONS,
} from '../constants/level.constants';
import type { InterviewOutlineTopic } from '../schemas/interview-outline.schema';
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

  const outline: InterviewOutlineTopic[] = [
    {
      key: 'self_intro',
      title: '自我介绍',
      questionType: QuestionTypeEnum.SelfIntro,
    },
    {
      key: 'order_system_refactor',
      title: '订单系统重构',
      questionType: QuestionTypeEnum.Project,
    },
    {
      key: 'tcp_handshake',
      title: 'TCP 三次握手',
      questionType: QuestionTypeEnum.Fundamentals,
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

    /** 渲染大纲链并捕获最终提示词文本（断言注入变量而非模型输出） */
    const captureOutlinePrompt = async (input: {
      jobDescription: string;
      resume: Record<string, any>;
      levelConfig: typeof levelConfig;
    }) => {
      let capturedPrompt = '';
      mockAiService.generateInterviewOutline.mockImplementation(() =>
        RunnableLambda.from(async (promptValue: { toString(): string }) => {
          capturedPrompt = String(promptValue);
          return JSON.stringify({
            topics: [
              { key: 'intro', title: '开场', questionType: 'self_intro' },
            ],
          });
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (raw: any) =>
          typeof raw === 'string' ? JSON.parse(raw) : raw,
        ),
      );

      await service.generateOutline(input);
      return capturedPrompt;
    };

    it('should inject the project deep-dive quota into the outline prompt', async () => {
      const capturedPrompt = await captureOutlinePrompt({
        jobDescription: '负责后端服务开发',
        // 校招配额范围 = 项目 + 实习
        resume: {
          projectExperience: [
            { title: '订单中台', startTime: '2024-06', endTime: '至今' },
          ],
          internshipExperience: [
            {
              companyName: '字节跳动',
              position: '后端实习',
              startTime: '2023-01',
              endTime: '2023-06',
            },
          ],
        },
        levelConfig: { ...levelConfig, mode: InterviewModeEnum.Campus },
      });

      expect(capturedPrompt).toContain('项目深挖配额');
      expect(capturedPrompt).toContain('「订单中台」（2024-06 至今）');
      expect(capturedPrompt).toContain('「字节跳动·后端实习」');
    });

    it('should scope the quota to work and project experience in experienced mode', async () => {
      const capturedPrompt = await captureOutlinePrompt({
        jobDescription: '负责后端服务开发',
        // 社招配额范围 = 工作 + 项目，实习不参与分配
        resume: {
          workExperience: [
            {
              companyName: '阿里云',
              position: '后端工程师',
              workTime: '2022-03',
              dismissalTime: '至今',
            },
          ],
          projectExperience: [
            { title: '订单中台', startTime: '2024-06', endTime: '2025-06' },
          ],
          internshipExperience: [
            {
              companyName: '字节跳动',
              position: '后端实习',
              startTime: '2023-01',
              endTime: '2023-06',
            },
          ],
        },
        levelConfig,
      });

      expect(capturedPrompt).toContain('「阿里云·后端工程师」（2022-03 至今）');
      expect(capturedPrompt).toContain('「订单中台」（2024-06 ~ 2025-06）');
      // 简历正文（resume_content）仍含实习原文，只校验配额清单段落
      const quotaSection = capturedPrompt.split('## 项目深挖配额')[1] ?? '';
      expect(quotaSection).not.toContain('字节跳动');
    });

    it('should inject a fallback note when the resume has no projects', async () => {
      const capturedPrompt = await captureOutlinePrompt({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig: { ...levelConfig, mode: InterviewModeEnum.Campus },
      });

      expect(capturedPrompt).toContain('候选人未提供可解析的项目/实习经历');
    });

    it('should inject an experienced fallback note mentioning work experience', async () => {
      const capturedPrompt = await captureOutlinePrompt({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
      });

      expect(capturedPrompt).toContain('候选人未提供可解析的项目/工作经历');
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
        // 大纲主题已全部覆盖：结束政策按原时长口径生效
        askedTopicKeys: outline.map((topic) => topic.key),
        elapsedMinutes: 35,
        askedCount: 16,
        endPolicy: 'can_end',
      });

      expect(capturedPrompt).toContain('已进行 35 分钟');
      expect(capturedPrompt).toContain('已提问 16 个问题');
      expect(capturedPrompt).toContain('可以结束');
    });

    it('should forbid ending while outline topics remain, whatever the policy', async () => {
      // 核心需求：主题没问完就收尾会让 15 个模块只考察 12 个，
      // 提示词必须在「可以结束」「必须结束」两种政策下都禁止收尾
      const remainingCases = [
        {
          endPolicy: 'can_end' as const,
          elapsedMinutes: 47,
          askedCount: 24,
          expected: ['禁止结束', '仍有 2 个大纲主题尚未覆盖', '必须继续出题'],
        },
        {
          endPolicy: 'must_end' as const,
          elapsedMinutes: 61,
          askedCount: 24,
          expected: [
            '必须收尾，但大纲覆盖未完成',
            '仍有 2 个主题尚未覆盖',
            '逐个把剩余主题问完',
          ],
        },
      ];

      for (const testCase of remainingCases) {
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
          // 还剩 order_system_refactor 与 tcp_handshake 未覆盖
          askedTopicKeys: ['self_intro'],
          elapsedMinutes: testCase.elapsedMinutes,
          askedCount: testCase.askedCount,
          endPolicy: testCase.endPolicy,
        });

        for (const expected of testCase.expected) {
          expect(capturedPrompt).toContain(expected);
        }
      }
    });

    it('should derive the cannot_end thresholds from the shared constants', async () => {
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
        elapsedMinutes: 10,
        askedCount: 3,
        endPolicy: 'cannot_end',
      });

      // 阈值文案必须与 resolveEndPolicy 的判定同源，否则改常量会让
      // 提示词描述的政策与服务端实际政策分叉
      expect(capturedPrompt).toContain(
        `满 ${MIN_MAIN_DURATION_MS / 60_000} 分钟`,
      );
      expect(capturedPrompt).toContain(`超过 ${SOFT_MAX_MAIN_QUESTIONS} 题`);
      expect(capturedPrompt).toContain('禁止结束');
    });

    it('should describe the must_end policy as mandatory transition once covered', async () => {
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

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: outline.map((topic) => topic.key),
        elapsedMinutes: 62,
        askedCount: 18,
        endPolicy: 'must_end',
      });

      expect(capturedPrompt).toContain('必须结束');
      expect(capturedPrompt).toContain('大纲主题已全部覆盖');
      // 主题已问完：收尾语原样返回，由服务层切换阶段
      expect(result.shouldEndMainPhase).toBe(true);
      expect(result.questionType).toBe('reverse');
    });

    it('should keep the interview going when the model ends early with topics left', async () => {
      // 模型无视覆盖前置条件输出收尾语：必须被纠回继续出题，
      // 否则告别语会被当成下一题写入转录（候选人看到告别语还要作答）
      setupModel(mockAiService.generateInterviewQuestion, [
        {
          ...validTurn,
          topicKey: undefined,
          question: '今天就聊到这里，你有什么想问我的吗？',
          questionType: 'reverse',
          shouldEndMainPhase: true,
        },
      ]);

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        // 仅自我介绍已覆盖，还剩 2 个主题
        askedTopicKeys: ['self_intro'],
        elapsedMinutes: 47,
        askedCount: 24,
        endPolicy: 'can_end',
      });

      expect(result.shouldEndMainPhase).toBe(false);
      expect(result.topicKey).toBe('order_system_refactor');
      expect(result.questionType).toBe('project');
      expect(result.question).toContain('订单系统重构');
      expect(result.question).not.toContain('今天');
    });

    it('should only clear the end flag when the early-ending question still targets a remaining topic', async () => {
      // 模型只是提前置位了收尾标记，题目本身仍指向未覆盖主题：保留题目文本
      setupModel(mockAiService.generateInterviewQuestion, [
        {
          ...validTurn,
          topicKey: 'tcp_handshake',
          question: '说说 TCP 三次握手的必要性？',
          questionType: 'fundamentals',
          shouldEndMainPhase: true,
        },
      ]);

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: ['self_intro', 'order_system_refactor'],
        elapsedMinutes: 61,
        askedCount: 24,
        endPolicy: 'must_end',
      });

      expect(result.shouldEndMainPhase).toBe(false);
      expect(result.question).toBe('说说 TCP 三次握手的必要性？');
      expect(result.topicKey).toBe('tcp_handshake');
    });

    it('should keep honoring a candidate-requested end even with topics left', async () => {
      // 候选人主动终止优先级最高，不受覆盖前置条件影响
      setupModel(mockAiService.generateInterviewQuestion, [
        {
          ...validTurn,
          topicKey: undefined,
          question: '好的，那今天就先到这里，祝后续顺利。',
          questionType: 'reverse',
          shouldEndMainPhase: true,
          userRequestedEnd: true,
        },
      ]);

      const result = await service.generateTurn({
        jobDescription: '负责后端服务开发',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: ['self_intro'],
        elapsedMinutes: 20,
        askedCount: 8,
        endPolicy: 'cannot_end',
      });

      expect(result.shouldEndMainPhase).toBe(true);
      expect(result.userRequestedEnd).toBe(true);
      expect(result.question).toContain('祝后续顺利');
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
        // 大纲主题已全部覆盖，收尾语才被允许
        askedTopicKeys: outline.map((topic) => topic.key),
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
