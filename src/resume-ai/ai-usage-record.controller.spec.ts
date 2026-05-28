import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  InternalServerErrorException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AiUsageRecordController } from './ai-usage-record.controller';
import { AiUsageRecordService } from './ai-usage-record.service';

describe('AiUsageRecordController', () => {
  let controller: AiUsageRecordController;
  let mockService: any;

  beforeEach(async () => {
    mockService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      remove: jest.fn(),
      getStats: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AiUsageRecordController],
      providers: [
        {
          provide: AiUsageRecordService,
          useValue: mockService,
        },
      ],
    }).compile();

    controller = module.get<AiUsageRecordController>(AiUsageRecordController);
  });

  describe('findAll', () => {
    it('应返回分页列表', async () => {
      const mockResult = {
        list: [{ _id: '1', aiFunction: 'resume_generation' }],
        total: 1,
        page: 1,
        pageSize: 10,
        totalPages: 1,
      };
      mockService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll({ page: 1, pageSize: 10 });

      expect(result).toEqual(mockResult);
      expect(mockService.findAll).toHaveBeenCalledWith({
        page: 1,
        pageSize: 10,
      });
    });

    it('服务层抛 BadRequestException 时应透传', async () => {
      mockService.findAll.mockRejectedValue(
        new BadRequestException('参数错误'),
      );

      await expect(
        controller.findAll({ page: 1, pageSize: 10 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('服务层抛未知错误时应包装为 InternalServerErrorException', async () => {
      mockService.findAll.mockRejectedValue(new Error('数据库连接失败'));

      await expect(
        controller.findAll({ page: 1, pageSize: 10 }),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('findOne', () => {
    it('应返回单条记录', async () => {
      const record = {
        _id: new Types.ObjectId(),
        userId: new Types.ObjectId(),
        aiFunction: 'resume_analysis',
        success: true,
      };
      mockService.findById.mockResolvedValue(record);

      const result = await controller.findOne(record._id.toHexString());

      expect(result).toEqual(record);
      expect(mockService.findById).toHaveBeenCalledWith(
        record._id.toHexString(),
      );
    });

    it('记录不存在时应抛 BadRequestException', async () => {
      mockService.findById.mockRejectedValue(
        new BadRequestException('AI使用记录不存在'),
      );

      await expect(
        controller.findOne(new Types.ObjectId().toHexString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('服务层抛未知错误时应包装为 InternalServerErrorException', async () => {
      mockService.findById.mockRejectedValue(new Error('数据库连接失败'));

      await expect(
        controller.findOne(new Types.ObjectId().toHexString()),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('remove', () => {
    it('应删除并返回确认', async () => {
      mockService.remove.mockResolvedValue({ deleted: true });

      const result = await controller.remove(
        new Types.ObjectId().toHexString(),
      );

      expect(result).toEqual({ deleted: true });
    });

    it('记录不存在时应抛 BadRequestException', async () => {
      mockService.remove.mockRejectedValue(
        new BadRequestException('AI使用记录不存在'),
      );

      await expect(
        controller.remove(new Types.ObjectId().toHexString()),
      ).rejects.toThrow(BadRequestException);
    });

    it('服务层抛未知错误时应包装为 InternalServerErrorException', async () => {
      mockService.remove.mockRejectedValue(new Error('数据库连接失败'));

      await expect(
        controller.remove(new Types.ObjectId().toHexString()),
      ).rejects.toThrow(InternalServerErrorException);
    });
  });

  describe('getStats', () => {
    it('应返回全局 AI 用量统计', async () => {
      const mockStats = {
        totalCalls: 100,
        successRate: 0.85,
        byFunction: {
          resume_generation: { total: 40, success: 35 },
          module_optimization: { total: 30, success: 25 },
        },
        dailyUsage: [{ date: '2025-05-01', count: 10 }],
        topUsers: [{ userId: 'user-1', count: 25 }],
      };
      mockService.getStats.mockResolvedValue(mockStats);

      const result = await controller.getStats();

      expect(result).toEqual(mockStats);
      expect(mockService.getStats).toHaveBeenCalledTimes(1);
    });

    it('服务层抛 BadRequestException 时应透传', async () => {
      mockService.getStats.mockRejectedValue(
        new BadRequestException('查询失败'),
      );

      await expect(controller.getStats()).rejects.toThrow(BadRequestException);
    });

    it('服务层抛未知错误时应包装为 InternalServerErrorException', async () => {
      mockService.getStats.mockRejectedValue(new Error('数据库连接失败'));

      await expect(controller.getStats()).rejects.toThrow(
        InternalServerErrorException,
      );
    });
  });
});
