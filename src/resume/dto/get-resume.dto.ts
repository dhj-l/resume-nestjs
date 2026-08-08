import { IsOptional } from 'class-validator';

/**
 * 查询简历列表 DTO
 * 用于分页查询简历列表
 */
export class GetResumeDto {
  /**
   * 页码，从1开始
   */
  @IsOptional()
  page?: number;

  /**
   * 每页数量
   */
  @IsOptional()
  pageSize?: number;
}
