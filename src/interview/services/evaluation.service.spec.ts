import { Test, TestingModule } from '@nestjs/testing';
import { RunnableLambda } from '@langchain/core/runnables';
import { AiService } from 'src/ai/ai.service';
import { EvaluationService } from './evaluation.service';
import {
  ExperienceLevelEnum,
  InterviewModeEnum,
  InterviewStageEnum,
} from '../constants/level.constants';

describe('EvaluationService - 面试评价报告', () => {
  let service: EvaluationService;

  const mockAiService = {
    generateInterviewReport: jest.fn(),
    createRobustStructuredParser: jest.fn(),
  } as any;

  const levelConfig = {
    mode: InterviewModeEnum.Experienced,
    stage: InterviewStageEnum.Second,
    experienceLevel: ExperienceLevelEnum.Senior,
  };

  const validReport = {
    overallScore: 75,
    summary: '整体表现良好。',
    dimensionScores: { completeness: 70, logic: 80, depth: 65 },
    topics: [
      {
        topicKey: 'database',
        title: '数据库设计',
        score: 70,
        comment: '基本概念清晰',
      },
    ],
    reverseFeedback: { score: 80, comment: '反问有深度' },
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
    let attempts = 0;
    mockAiService.generateInterviewReport.mockImplementation(() =>
      RunnableLambda.from(async () => {
        attempts++;
        return JSON.stringify(outputs.shift());
      }),
    );
    mockAiService.createRobustStructuredParser.mockReturnValue(
      RunnableLambda.from(async (text: string) => JSON.parse(text)),
    );
    return { getAttempts: () => attempts };
  };

  it('should generate a report on first attempt', async () => {
    setupChain([validReport]);

    const result = await service.generateReport({
      jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
      levelConfig,
      outline: [{ key: 'database', title: '数据库设计' }],
      messages: [],
      durationMinutes: 42,
      questionCount: 12,
    });

    expect(result.overallScore).toBe(75);
    expect(result.dimensionScores?.logic).toBe(80);
    expect(mockAiService.generateInterviewReport).toHaveBeenCalledTimes(1);
  });

  it('should inject duration and question count instead of planned rounds', async () => {
    let capturedPrompt = '';
    mockAiService.generateInterviewReport.mockImplementation(() =>
      RunnableLambda.from(async (promptValue: { toString(): string }) => {
        capturedPrompt = String(promptValue);
        return JSON.stringify(validReport);
      }),
    );
    mockAiService.createRobustStructuredParser.mockReturnValue(
      RunnableLambda.from(async (text: string) => JSON.parse(text)),
    );

    await service.generateReport({
      jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
      levelConfig,
      outline: [{ key: 'database', title: '数据库设计' }],
      messages: [],
      durationMinutes: 47,
      questionCount: 16,
    });

    // 时长驱动的面试按实际时长与题数评估，不再有计划轮次概念
    expect(capturedPrompt).toContain('47 分钟');
    expect(capturedPrompt).toContain('16 个问题');
    expect(capturedPrompt).not.toContain('计划');
  });

  it('should retry once when the first attempt fails then succeed', async () => {
    const { getAttempts } = setupChain([{ invalid: true }, validReport]);

    const result = await service.generateReport({
      jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
      levelConfig,
      outline: [{ key: 'database', title: '数据库设计' }],
      messages: [],
      durationMinutes: 30,
      questionCount: 10,
    });

    expect(result.overallScore).toBe(75);
    // 首次 + 1 次重试
    expect(getAttempts()).toBe(2);
  });

  it('should throw after exhausting retries with empty transcript fallback', async () => {
    const { getAttempts } = setupChain([null, null]);

    await expect(
      service.generateReport({
        jobDescription: '负责后端服务开发，要求熟悉 Node.js 与数据库设计',
        levelConfig,
        outline: [{ key: 'database', title: '数据库设计' }],
        messages: [],
        durationMinutes: 15,
        questionCount: 4,
      }),
    ).rejects.toThrow();
    // 首次 + 1 次重试（报告单次超时已放宽，重试次数相应收敛，避免收尾等待成倍放大）
    expect(getAttempts()).toBe(2);
  });
});
