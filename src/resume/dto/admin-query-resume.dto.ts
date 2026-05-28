import { IsOptional, IsString, MaxLength, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 管理员查询简历列表 DTO（跨用户，支持分页、搜索、筛选）
 */
export class AdminQueryResumeDto {
  /**
   * 页码，从 1 开始，默认 1
   */
  @IsOptional()
  @Type(() => Number)
  page?: number;

  /**
   * 每页数量，默认 10，最大 100
   */
  @IsOptional()
  @Type(() => Number)
  pageSize?: number;

  /**
   * 关键词搜索（匹配简历标题）
   */
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '搜索关键词长度不能超过100位' })
  keyword?: string;

  /**
   * 按用户 ID 筛选
   */
  @IsOptional()
  @IsString()
  userId?: string;

  /**
   * 按简历类型筛选
   */
  @IsOptional()
  @IsString()
  type?: string;

  /**
   * 是否为模板简历
   */
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'isTemplate 必须为布尔值' })
  isTemplate?: boolean;
}
