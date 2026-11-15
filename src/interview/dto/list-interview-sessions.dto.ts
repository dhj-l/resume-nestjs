import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { InterviewStatusEnum } from '../constants/level.constants';

/**
 * 面试记录列表查询 DTO（分页 + 状态筛选）
 */
export class ListInterviewSessionsDto {
  /**
   * 页码（从 1 开始）
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须是整数' })
  @Min(1, { message: 'page 最小为 1' })
  page?: number;

  /**
   * 每页数量（1-50）
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须是整数' })
  @Min(1, { message: 'pageSize 最小为 1' })
  @Max(50, { message: 'pageSize 最大为 50' })
  pageSize?: number;

  /**
   * 会话状态筛选：in_progress / completed / cancelled
   */
  @IsOptional()
  @IsEnum(InterviewStatusEnum, {
    message: 'status 必须是 in_progress/completed/cancelled 之一',
  })
  status?: InterviewStatusEnum;
}
