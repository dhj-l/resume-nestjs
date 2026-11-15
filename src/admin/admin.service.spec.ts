import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { AdminService } from './admin.service';

/**
 * 构建 mock countDocuments 方法 — 返回 { exec: fn }
 * Mongoose 中 countDocuments() 返回 Query 对象，需 .exec() 获取结果
 */
function makeCountDocs(impl: (filter?: any) => number) {
  return jest.fn((filter?: any) => ({
    exec: jest.fn().mockResolvedValue(impl(filter)),
  }));
}

describe('AdminService', () => {
  let service: AdminService;
  let mockUserModel: any;
  let mockResumeModel: any;
  let mockTemplateModel: any;
  let mockAiUsageRecordModel: any;

  beforeEach(async () => {
    mockUserModel = {
      countDocuments: jest.fn(),
    };
    mockResumeModel = {
      countDocuments: jest.fn(),
    };
    mockTemplateModel = {
      countDocuments: jest.fn(),
    };
    mockAiUsageRecordModel = {
      countDocuments: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getModelToken('User'), useValue: mockUserModel },
        { provide: getModelToken('Resume'), useValue: mockResumeModel },
        { provide: getModelToken('Template'), useValue: mockTemplateModel },
        {
          provide: getModelToken('AiUsageRecord'),
          useValue: mockAiUsageRecordModel,
        },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboard', () => {
    it('应返回完整的仪表盘数据', async () => {
      // 用户统计
      mockUserModel.countDocuments = makeCountDocs((filter?: any) => {
        if (!filter || Object.keys(filter).length === 0) return 100;
        if (filter?.createdAt?.$gte) return 15;
        return 0;
      });

      // 简历统计
      mockResumeModel.countDocuments = makeCountDocs((filter?: any) => {
        if (!filter || Object.keys(filter).length === 0) return 220;
        if (filter?.isTemplate === false) return 200;
        if (filter?.isTemplate === true) return 20;
        return 0;
      });

      // 模板统计
      mockTemplateModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(30),
      }));

      // AI 用量统计
      mockAiUsageRecordModel.countDocuments = makeCountDocs((filter?: any) => {
        if (!filter || Object.keys(filter).length === 0) return 500;
        if (filter?.createdAt?.$gte) return 12;
        if (filter?.success === true) return 460;
        return 0;
      });

      const result = await service.getDashboard();

      expect(result.users).toEqual({ total: 100, newThisMonth: 15 });
      expect(result.resumes).toEqual({ total: 200, templates: 20 });
      expect(result.templates).toEqual({ total: 30 });
      expect(result.aiCalls).toEqual({
        total: 500,
        today: 12,
        successRate: 0.92,
      });
    });

    it('空数据库时应返回全部零值', async () => {
      const zeroFn = jest.fn(() => ({ exec: jest.fn().mockResolvedValue(0) }));
      mockUserModel.countDocuments = zeroFn;
      mockResumeModel.countDocuments = zeroFn;
      mockTemplateModel.countDocuments = zeroFn;
      mockAiUsageRecordModel.countDocuments = zeroFn;

      const result = await service.getDashboard();

      expect(result.users).toEqual({ total: 0, newThisMonth: 0 });
      expect(result.resumes).toEqual({ total: 0, templates: 0 });
      expect(result.templates).toEqual({ total: 0 });
      expect(result.aiCalls).toEqual({ total: 0, today: 0, successRate: 0 });
    });

    it('AI 调用全成功时 successRate 应为 1', async () => {
      const tenFn = jest.fn(() => ({ exec: jest.fn().mockResolvedValue(10) }));
      mockUserModel.countDocuments = tenFn;
      mockResumeModel.countDocuments = tenFn;
      const fiveFn = jest.fn(() => ({ exec: jest.fn().mockResolvedValue(5) }));
      mockTemplateModel.countDocuments = fiveFn;
      mockAiUsageRecordModel.countDocuments = makeCountDocs((filter?: any) => {
        if (filter?.success === true) return 100;
        if (filter?.createdAt?.$gte) return 5;
        return 100;
      });

      const result = await service.getDashboard();

      expect(result.aiCalls.successRate).toBe(1);
    });

    it('AI 调用全失败时 successRate 应为 0', async () => {
      const tenFn = jest.fn(() => ({ exec: jest.fn().mockResolvedValue(10) }));
      mockUserModel.countDocuments = tenFn;
      mockResumeModel.countDocuments = tenFn;
      const fiveFn = jest.fn(() => ({ exec: jest.fn().mockResolvedValue(5) }));
      mockTemplateModel.countDocuments = fiveFn;
      mockAiUsageRecordModel.countDocuments = makeCountDocs((filter?: any) => {
        if (filter?.success === true) return 0;
        if (filter?.createdAt?.$gte) return 3;
        return 100;
      });

      const result = await service.getDashboard();

      expect(result.aiCalls.successRate).toBe(0);
    });

    it('并发调用 countDocuments 各模型应独立', async () => {
      mockUserModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(50),
      }));
      mockResumeModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(100),
      }));
      mockTemplateModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(10),
      }));
      mockAiUsageRecordModel.countDocuments = jest.fn(() => ({
        exec: jest.fn().mockResolvedValue(200),
      }));

      await service.getDashboard();

      expect(mockUserModel.countDocuments).toHaveBeenCalled();
      expect(mockResumeModel.countDocuments).toHaveBeenCalled();
      expect(mockTemplateModel.countDocuments).toHaveBeenCalled();
      expect(mockAiUsageRecordModel.countDocuments).toHaveBeenCalled();
    });
  });
});
