import { Test, TestingModule } from '@nestjs/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { QuestionEngineService } from './question-engine.service';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
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
    createRobustStructuredParser: jest.fn(),
  } as any;

  const levelConfig = {
    experienceLevel: ExperienceLevelEnum.Mid,
    focus: InterviewFocusEnum.Technical,
  };

  const outline = [
    { key: 'nodejs_basics', title: 'Node.js 基础', difficulty: '基础' },
    { key: 'database', title: '数据库设计', difficulty: '进阶' },
    { key: 'project_architecture', title: '架构设计', difficulty: '高阶' },
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

  describe('resolveTargetRounds', () => {
    it('should map each focus to its configured target rounds', () => {
      expect(service.resolveTargetRounds(levelConfig)).toBe(8);
      expect(
        service.resolveTargetRounds({
          experienceLevel: ExperienceLevelEnum.Senior,
          focus: InterviewFocusEnum.Project,
        }),
      ).toBe(6);
      expect(
        service.resolveTargetRounds({
          experienceLevel: ExperienceLevelEnum.Junior,
          focus: InterviewFocusEnum.Mixed,
        }),
      ).toBe(10);
    });
  });

  describe('generateOutline', () => {
    const mockChain = (result: unknown) => {
      mockAiService.generateInterviewOutline.mockReturnValue(
        RunnableLambda.from(async () => JSON.stringify(result)),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (text: string) => JSON.parse(text)),
      );
    };

    it('should generate and normalize an outline', async () => {
      mockChain({ topics: outline });
      const result = await service.generateOutline({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: { basicInfo: { name: '张三' } },
        levelConfig,
      });
      expect(result).toEqual(outline);
    });

    it('should retry when AI returns empty topics then succeed', async () => {
      mockAiService.generateInterviewOutline
        .mockReturnValueOnce(RunnableLambda.from(async () => '{"topics":[]}'))
        .mockReturnValueOnce(
          RunnableLambda.from(async () => JSON.stringify({ topics: outline })),
        );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (text: string) => JSON.parse(text)),
      );

      const result = await service.generateOutline({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: {},
        levelConfig,
      });
      expect(mockAiService.generateInterviewOutline).toHaveBeenCalledTimes(2);
      expect(result).toEqual(outline);
    });

    it('should throw after exhausting retries', async () => {
      mockAiService.generateInterviewOutline.mockReturnValue(
        RunnableLambda.from(async () => '{"topics":[]}'),
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
      expect(mockAiService.generateInterviewOutline).toHaveBeenCalledTimes(3);
    });
  });

  describe('generateNextQuestion', () => {
    const messages: InterviewMessage[] = [
      {
        role: MessageRoleEnum.Interviewer,
        content: '请介绍一下事件循环机制。',
        round: 1,
        kind: MessageKindEnum.Question,
      } as InterviewMessage,
      {
        role: MessageRoleEnum.Candidate,
        content: '事件循环包括宏任务和微任务队列……但我说不太清楚优先级。',
        round: 1,
        kind: MessageKindEnum.Answer,
      } as InterviewMessage,
    ];

    it('should return the next question decision', async () => {
      const decision = {
        topicKey: 'nodejs_basics',
        question: '那宏任务和微任务的执行顺序你能展开讲讲吗？',
        isFollowUp: true,
        shouldEndInterview: false,
      };
      mockAiService.generateInterviewQuestion.mockReturnValue(
        RunnableLambda.from(async () => JSON.stringify(decision)),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (text: string) => JSON.parse(text)),
      );

      const result = await service.generateNextQuestion({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: ['nodejs_basics'],
        round: 2,
      });

      expect(result.isFollowUp).toBe(true);
      expect(result.topicKey).toBe('nodejs_basics');
    });

    it('should pass remaining topics excluding already asked ones', async () => {
      let capturedPrompt = '';
      mockAiService.generateInterviewQuestion.mockImplementation(() =>
        RunnableLambda.from(async (promptValue: { toString(): string }) => {
          capturedPrompt = String(promptValue);
          return JSON.stringify({
            topicKey: 'database',
            question: '下一题',
            isFollowUp: false,
          });
        }),
      );
      mockAiService.createRobustStructuredParser.mockReturnValue(
        RunnableLambda.from(async (input: any) =>
          typeof input === 'string' ? JSON.parse(input) : input,
        ),
      );

      await service.generateNextQuestion({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        resume: {},
        levelConfig,
        outline,
        messages,
        askedTopicKeys: ['nodejs_basics'],
        round: 2,
      });

      // 已考察主题不应出现在"尚未覆盖主题"中
      const remainingSection = capturedPrompt.split('## 尚未覆盖的主题')[1];
      expect(remainingSection).toContain('database');
      expect(remainingSection).toContain('project_architecture');
      expect(
        remainingSection
          .slice(0, remainingSection.indexOf('##'))
          .includes('nodejs_basics'),
      ).toBe(false);
      // 对话历史应包含面试官与候选人的发言
      expect(capturedPrompt).toContain('面试官');
      expect(capturedPrompt).toContain('候选人');
    });
  });
});
