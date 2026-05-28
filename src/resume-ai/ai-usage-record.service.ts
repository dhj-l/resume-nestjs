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

  /**
   * 全局 AI 用量统计（管理员用）
   * @returns 总调用次数、按功能分布、成功率、近30天每日用量、Top 用户
   */
  async getStats(): Promise<{
    totalCalls: number;
    successRate: number;
    byFunction: Record<string, { total: number; success: number }>;
    dailyUsage: { date: string; count: number }[];
    topUsers: { userId: string; count: number }[];
  }> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [totalCalls, successCount, byFunction, dailyUsage, topUsers] =
      await Promise.all([
        // 总调用次数
        this.aiUsageRecordModel.countDocuments().exec(),

        // 成功次数
        this.aiUsageRecordModel.countDocuments({ success: true }).exec(),

        // 按功能分组统计
        this.aiUsageRecordModel
          .aggregate([
            {
              $group: {
                _id: '$aiFunction',
                total: { $sum: 1 },
                success: { $sum: { $cond: ['$success', 1, 0] } },
              },
            },
          ])
          .exec(),

        // 近 30 天每日用量
        this.aiUsageRecordModel
          .aggregate([
            { $match: { createdAt: { $gte: thirtyDaysAgo } } },
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ])
          .exec(),

        // Top 5 用户
        this.aiUsageRecordModel
          .aggregate([
            {
              $group: {
                _id: '$userId',
                count: { $sum: 1 },
              },
            },
            { $sort: { count: -1 } },
            { $limit: 5 },
          ])
          .exec(),
      ]);

    const byFuncMap: Record<string, { total: number; success: number }> = {};
    for (const item of byFunction) {
      byFuncMap[item._id] = { total: item.total, success: item.success };
    }

    const dailyMap: { date: string; count: number }[] = dailyUsage.map((d) => ({
      date: d._id,
      count: d.count,
    }));

    const userList: { userId: string; count: number }[] = topUsers.map((u) => ({
      userId: u._id.toString(),
      count: u.count,
    }));

    return {
      totalCalls,
      successRate: totalCalls > 0 ? successCount / totalCalls : 0,
      byFunction: byFuncMap,
      dailyUsage: dailyMap,
      topUsers: userList,
    };
  }
}
