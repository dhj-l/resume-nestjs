import { Test, TestingModule } from '@nestjs/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { EvaluationService } from './evaluation.service';
import {
  ExperienceLevelEnum,
  InterviewFocusEnum,
} from '../constants/level.constants';

describe('EvaluationService - 面试评价报告', () => {
  let service: EvaluationService;

  const mockAiService = {
    generateInterviewReport: jest.fn(),
    createRobustStructuredParser: jest.fn(),
  } as any;

  const levelConfig = {
    experienceLevel: ExperienceLevelEnum.Senior,
    focus: InterviewFocusEnum.Mixed,
  };

  const validReport = {
    overallScore: 75,
    summary: '整体表现良好。',
    topics: [
      {
        topicKey: 'database',
        title: '数据库设计',
        score: 70,
        comment: '基本概念清晰',
      },
    ],
  };

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EvaluationService,
        { provide: AiService, useValue: mockAiService },
      ],
    }).compile();
    service = module.get<EvaluationService>(EvaluationService);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const setupChain = (outputs: unknown[]) => {
    mockAiService.generateInterviewReport.mockImplementation(() =>
      RunnableLambda.from(async () => JSON.stringify(outputs.shift())),
    );
    mockAiService.createRobustStructuredParser.mockReturnValue(
      RunnableLambda.from(async (text: string) => JSON.parse(text)),
    );
  };

  it('should generate a report on first attempt', async () => {
    setupChain([validReport]);

    const result = await service.generateReport({
      jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
      levelConfig,
      outline: [{ key: 'database', title: '数据库设计' }],
      messages: [],
      round: 5,
    });

    expect(result.overallScore).toBe(75);
    expect(mockAiService.generateInterviewReport).toHaveBeenCalledTimes(1);
  });

  it('should retry once when the first attempt fails then succeed', async () => {
    setupChain([{ invalid: true }, validReport]);

    const result = await service.generateReport({
      jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
      levelConfig,
      outline: [{ key: 'database', title: '数据库设计' }],
      messages: [],
      round: 5,
    });

    expect(result.overallScore).toBe(75);
    expect(mockAiService.generateInterviewReport).toHaveBeenCalledTimes(2);
  });

  it('should throw after exhausting retries with empty transcript fallback', async () => {
    setupChain([null, null, null]);

    await expect(
      service.generateReport({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        levelConfig,
        outline: [{ key: 'database', title: '数据库设计' }],
        messages: [],
        round: 3,
      }),
    ).rejects.toThrow();
    expect(mockAiService.generateInterviewReport).toHaveBeenCalledTimes(3);
  });
});
