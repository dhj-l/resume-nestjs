import { Test, TestingModule } from '@nestjs/testing';
import { AiUsageRecordService } from './ai-usage-record.service';
import { Types } from 'mongoose';

/**
 * 构建 mock countDocuments — Mongoose 中 countDocuments() 返回 Query 对象，
 * 需链式调用 .exec()，所以 mock 必须返回 { exec: fn }
 */
function makeCountDocs(impl: (filter?: any) => number) {
  return jest.fn((filter?: any) => ({
    exec: jest.fn().mockResolvedValue(impl(filter)),
  }));
}

/**
 * Mongoose aggregate 也返回 Aggregate 对象，需 .exec()
 */
function makeAggregate(results: any[]) {
  return { exec: jest.fn().mockResolvedValue(results) };
}

describe('AiUsageRecordService — getStats', () => {
  let service: AiUsageRecordService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiUsageRecordService,
        {
          provide: 'AiUsageRecordModel',
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<AiUsageRecordService>(AiUsageRecordService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getStats', () => {
    it('应返回完整的统计数据', async () => {
      mockModel.countDocuments = makeCountDocs((filter?: any) => {
        if (filter?.success === true) return 85;
        return 100;
      });

      mockModel.aggregate.mockImplementation((pipeline: any[]) => {
        const firstStage = pipeline[0] as any;
        const groupKey = firstStage.$group?._id;

        if (groupKey === '$aiFunction') {
          return makeAggregate([
            { _id: 'resume_generation', total: 40, success: 35 },
            { _id: 'module_optimization', total: 30, success: 25 },
            { _id: 'resume_analysis', total: 20, success: 18 },
            { _id: 'smart_import', total: 10, success: 7 },
          ]);
        }

        if (firstStage.$match?.createdAt) {
          return makeAggregate([
            { _id: '2025-05-01', count: 5 },
            { _id: '2025-05-02', count: 8 },
          ]);
        }

        return makeAggregate([
          { _id: new Types.ObjectId('aaaaaaaaaaaaaaaaaaaaaaaa'), count: 25 },
          { _id: new Types.ObjectId('bbbbbbbbbbbbbbbbbbbbbbbb'), count: 15 },
          { _id: new Types.ObjectId('cccccccccccccccccccccccc'), count: 10 },
        ]);
      });

      const result = await service.getStats();

      expect(result.totalCalls).toBe(100);
      expect(result.successRate).toBe(0.85);
      expect(result.byFunction).toEqual({
        resume_generation: { total: 40, success: 35 },
        module_optimization: { total: 30, success: 25 },
        resume_analysis: { total: 20, success: 18 },
        smart_import: { total: 10, success: 7 },
      });
      expect(result.dailyUsage).toEqual([
        { date: '2025-05-01', count: 5 },
        { date: '2025-05-02', count: 8 },
      ]);
      expect(result.topUsers).toEqual([
        { userId: 'aaaaaaaaaaaaaaaaaaaaaaaa', count: 25 },
        { userId: 'bbbbbbbbbbbbbbbbbbbbbbbb', count: 15 },
        { userId: 'cccccccccccccccccccccccc', count: 10 },
      ]);
    });

    it('无数据时应返回零值和空数组', async () => {
      mockModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(0),
      }));
      mockModel.aggregate.mockReturnValue(makeAggregate([]));

      const result = await service.getStats();

      expect(result.totalCalls).toBe(0);
      expect(result.successRate).toBe(0);
      expect(result.byFunction).toEqual({});
      expect(result.dailyUsage).toEqual([]);
      expect(result.topUsers).toEqual([]);
    });

    it('全部失败时 successRate 应为 0', async () => {
      mockModel.countDocuments = makeCountDocs((filter?: any) => {
        if (filter?.success === true) return 0;
        return 50;
      });
      mockModel.aggregate.mockReturnValue(makeAggregate([]));

      const result = await service.getStats();

      expect(result.totalCalls).toBe(50);
      expect(result.successRate).toBe(0);
    });

    it('全部成功时 successRate 应为 1', async () => {
      mockModel.countDocuments = makeCountDocs((filter?: any) => {
        if (filter?.success === true) return 50;
        return 50;
      });
      mockModel.aggregate.mockReturnValue(makeAggregate([]));

      const result = await service.getStats();

      expect(result.successRate).toBe(1);
    });

    it('aggregate 应被调用 3 次（按功能/每日/Top用户）', async () => {
      mockModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(10),
      }));
      mockModel.aggregate.mockReturnValue(makeAggregate([]));

      await service.getStats();

      expect(mockModel.aggregate).toHaveBeenCalledTimes(3);
    });

    it('按功能分组 pipeline 应包含 $cond', async () => {
      mockModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(10),
      }));
      mockModel.aggregate.mockReturnValue(makeAggregate([]));

      await service.getStats();

      const byFunctionCall = mockModel.aggregate.mock.calls[0][0];
      expect(byFunctionCall).toContainEqual(
        expect.objectContaining({
          $group: expect.objectContaining({
            _id: '$aiFunction',
            total: { $sum: 1 },
            success: { $sum: { $cond: expect.any(Array) } },
          }),
        }),
      );
    });
  });
});
