import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  SWEEP_INTERVAL_MS,
  InterviewStatusEnum,
} from './constants/level.constants';
import {
  InterviewSession,
  InterviewSessionDocument,
} from './entities/interview-session.entity';
import { timeoutCloseFields } from './utils/session-state.utils';

/**
 * 过期会话定时清扫
 *
 * 惰性检查（服务触点校验 expiresAt）保证正确性；
 * 本任务保证及时性，避免过期会话长期占用列表查询。
 * 终态字段与 InterviewService.closeAsTimeout 共用 timeoutCloseFields。
 */
@Injectable()
export class InterviewTimeoutScheduler {
  private readonly logger = new Logger(InterviewTimeoutScheduler.name);

  constructor(
    @InjectModel(InterviewSession.name)
    private readonly sessionModel: Model<InterviewSessionDocument>,
  ) {}

  /** 每 5 分钟清扫一次过期会话 */
  @Cron(`0 */${SWEEP_INTERVAL_MS / (60 * 1000)} * * * *`)
  async sweepExpiredSessions(): Promise<number> {
    const result = await this.sessionModel.updateMany(
      {
        status: InterviewStatusEnum.InProgress,
        expiresAt: { $lt: new Date() },
      },
      { $set: timeoutCloseFields() },
    );
    const closed = result.modifiedCount ?? 0;
    if (closed > 0) {
      this.logger.log(`定时清扫关闭了 ${closed} 个超时面试会话`);
    }
    return closed;
  }
}
