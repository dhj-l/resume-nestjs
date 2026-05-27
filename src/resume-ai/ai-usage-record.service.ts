import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AiUsageRecord } from './entities/ai-usage-record.entity';
import { QueryAiUsageRecordDto } from './dto/query-ai-usage-record.dto';

@Injectable()
export class AiUsageRecordService {
  private readonly logger = new Logger(AiUsageRecordService.name);

  constructor(
    @InjectModel(AiUsageRecord.name)
    private aiUsageRecordModel: Model<AiUsageRecord>,
  ) {}

  async findAll(query: QueryAiUsageRecordDto) {
    const {
      page = 1,
      pageSize = 10,
      userId,
      aiFunction,
      success,
      startDate,
      endDate,
    } = query;
    const skip = (page - 1) * pageSize;

    const filter: Record<string, any> = {};

    if (userId) {
      filter.userId = new Types.ObjectId(userId);
    }
    if (aiFunction) {
      filter.aiFunction = query.aiFunction;
    }
    if (success !== undefined) {
      filter.success = success;
    }
    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        filter.createdAt.$lte = new Date(endDate);
      }
    }

    const [total, list] = await Promise.all([
      this.aiUsageRecordModel.countDocuments(filter),
      this.aiUsageRecordModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
    ]);

    return {
      list,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findById(id: string) {
    const record = await this.aiUsageRecordModel.findById(id).lean();
    if (!record) {
      throw new BadRequestException('AI使用记录不存在');
    }
    return record;
  }

  async remove(id: string) {
    const record = await this.aiUsageRecordModel.findByIdAndDelete(id).lean();
    if (!record) {
      throw new BadRequestException('AI使用记录不存在');
    }
    return { deleted: true };
  }
}
