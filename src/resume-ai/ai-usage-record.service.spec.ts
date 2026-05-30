import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AiUsageRecordService } from './ai-usage-record.service';
import { QueryAiUsageRecordDto } from './dto/query-ai-usage-record.dto';

describe('AiUsageRecordService', () => {
  let service: AiUsageRecordService;
  let mockModel: any;

  beforeEach(async () => {
    mockModel = {
      countDocuments: jest.fn(),
      find: jest.fn(),
      findById: jest.fn(),
      findByIdAndDelete: jest.fn(),
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

  describe('findAll', () => {
    it('应返回分页结果（空筛选）', async () => {
      const query: QueryAiUsageRecordDto = { page: 1, pageSize: 10 };
      const mockList = [{ _id: '1', aiFunction: 'resume_generation' }];
      mockModel.countDocuments.mockResolvedValue(1);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue(mockList),
      });

      const result = await service.findAll(query);

      expect(result).toEqual({
        list: mockList,
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      });
      expect(mockModel.countDocuments).toHaveBeenCalledWith({});
    });

    it('应按 aiFunction 筛选', async () => {
      const query: QueryAiUsageRecordDto = {
        aiFunction: 'resume_analysis',
      };
      mockModel.countDocuments.mockResolvedValue(0);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(query);

      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        aiFunction: 'resume_analysis',
      });
    });

    it('应按 success 筛选', async () => {
      const query: QueryAiUsageRecordDto = { success: false };
      mockModel.countDocuments.mockResolvedValue(0);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(query);

      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        success: false,
      });
    });

    it('success 为 undefined 时不应加入筛选', async () => {
      const query: QueryAiUsageRecordDto = {};
      mockModel.countDocuments.mockResolvedValue(0);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(query);

      expect(mockModel.countDocuments).toHaveBeenCalledWith({});
    });

    it('应按 userId 筛选并转为 ObjectId', async () => {
      const userId = new Types.ObjectId().toHexString();
      const query: QueryAiUsageRecordDto = { userId };
      mockModel.countDocuments.mockResolvedValue(0);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(query);

      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        userId: expect.any(Types.ObjectId),
      });
    });

    it('应按日期范围筛选', async () => {
      const query: QueryAiUsageRecordDto = {
        startDate: '2025-01-01',
        endDate: '2025-12-31',
      };
      mockModel.countDocuments.mockResolvedValue(0);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(query);

      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        createdAt: {
          $gte: expect.any(Date),
          $lte: expect.any(Date),
        },
      });
    });

    it('仅 startDate 时应只有 $gte', async () => {
      const query: QueryAiUsageRecordDto = { startDate: '2025-06-01' };
      mockModel.countDocuments.mockResolvedValue(0);
      mockModel.find.mockReturnValue({
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        lean: jest.fn().mockResolvedValue([]),
      });

      await service.findAll(query);

      expect(mockModel.countDocuments).toHaveBeenCalledWith({
        createdAt: { $gte: expect.any(Date) },
      });
    });
  });

  describe('findById', () => {
    it('应返回查找到的记录', async () => {
      const record = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        aiFunction: 'resume_generation',
        success: true,
      };
      mockModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(record),
      });

      const result = await service.findById(record._id.toHexString());

      expect(result).toEqual(record);
    });

    it('记录不存在时应抛 BadRequestException', async () => {
      mockModel.findById.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.findById(new Types.ObjectId().toHexString()),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('应删除并返回 deleted: true', async () => {
      const id = new Types.ObjectId();
      mockModel.findByIdAndDelete.mockReturnValue({
        lean: jest.fn().mockResolvedValue({ _id: id }),
      });

      const result = await service.remove(id.toHexString());

      expect(result).toEqual({ deleted: true });
    });

    it('记录不存在时应抛 BadRequestException', async () => {
      mockModel.findByIdAndDelete.mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.remove(new Types.ObjectId().toHexString()),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
