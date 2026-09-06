import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';

/**
 * 查询简历列表 DTO
 * 用于分页查询简历列表
 */
export class GetResumeDto {
  /**
   * 页码，从1开始
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsInt()
  @Min(1)
  page?: number;

  /**
   * 每页数量
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}
