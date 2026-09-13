import {
  InterviewEndedReasonEnum,
  InterviewStatusEnum,
} from '../constants/level.constants';

/**
 * 超时关闭会话的终态字段（惰性检查与定时清扫共用）
 *
 * 两处各写过一遍同一组字段，已经出现过字段漂移（定时清扫漏写
 * lastActivityAt）；统一在此定义，保证两条关闭路径写出完全相同的终态。
 */
export function timeoutCloseFields(): Record<string, unknown> {
  const now = new Date();
  return {
    status: InterviewStatusEnum.Cancelled,
    endedReason: InterviewEndedReasonEnum.Timeout,
    endedAt: now,
    lastActivityAt: now,
  };
}
