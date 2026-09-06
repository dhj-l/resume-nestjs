import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

/**
 * 获取面试官问题语音 DTO
 */
export class InterviewTtsQueryDto {
  /**
   * 问题轮次（从 1 开始），对应会话中面试官提问的轮次
   */
  @Type(() => Number)
  @IsInt({ message: 'round 必须是整数' })
  @Min(1, { message: 'round 最小为 1' })
  @Max(99, { message: 'round 最大为 99' })
  round: number;
}
