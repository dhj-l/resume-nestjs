import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User } from '../user/entities/user.entity';
import { Resume } from '../resume/entities/resume.entity';
import { Template } from '../template/entities/template.entity';
import { AiUsageRecord } from '../resume-ai/entities/ai-usage-record.entity';

@Injectable()
export class AdminService {
  private readonly logger = new Logger(AdminService.name);

  constructor(
    @InjectModel(User.name) private userModel: Model<User>,
    @InjectModel(Resume.name) private resumeModel: Model<Resume>,
    @InjectModel(Template.name) private templateModel: Model<Template>,
    @InjectModel(AiUsageRecord.name)
    private aiUsageRecordModel: Model<AiUsageRecord>,
  ) {}

  /**
   * 系统仪表盘概览数据
   * @returns 用户/简历/模板/AI调用总计、本月新增等关键指标
   */
  async getDashboard(): Promise<{
    users: { total: number; newThisMonth: number };
    resumes: { total: number; templates: number };
    templates: { total: number };
    aiCalls: { total: number; today: number; successRate: number };
  }> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );

    const [
      totalUsers,
      newUsersThisMonth,
      totalResumes,
      totalTemplatesInResume,
      totalTemplates,
      totalAiCalls,
      todayAiCalls,
      successfulAiCalls,
    ] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.userModel
        .countDocuments({ createdAt: { $gte: startOfMonth } })
        .exec(),
      this.resumeModel.countDocuments({ isTemplate: false }).exec(),
      this.resumeModel.countDocuments({ isTemplate: true }).exec(),
      this.templateModel.countDocuments().exec(),
      this.aiUsageRecordModel.countDocuments().exec(),
      this.aiUsageRecordModel
        .countDocuments({ createdAt: { $gte: startOfToday } })
        .exec(),
      this.aiUsageRecordModel.countDocuments({ success: true }).exec(),
    ]);

    return {
      users: { total: totalUsers, newThisMonth: newUsersThisMonth },
      resumes: { total: totalResumes, templates: totalTemplatesInResume },
      templates: { total: totalTemplates },
      aiCalls: {
        total: totalAiCalls,
        today: todayAiCalls,
        successRate: totalAiCalls > 0 ? successfulAiCalls / totalAiCalls : 0,
      },
    };
  }
}
