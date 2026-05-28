import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * 查询用户列表 DTO（支持分页、关键词搜索、注册来源筛选）
 */
export class QueryUserDto {
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
   * 关键词搜索（匹配用户名或邮箱）
   */
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: '搜索关键词长度不能超过100位' })
  keyword?: string;

  /**
   * 注册来源筛选：email / gitee / github / qq
   */
  @IsOptional()
  @IsString()
  createdVia?: string;
}
