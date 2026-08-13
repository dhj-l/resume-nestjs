import { IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class GetResumeRecordsDto {
  @IsOptional()
  @Type(() => Number)
  page: number;
  @IsOptional()
  @Type(() => Number)
  pageSize: number;
  /**
   * 状态筛选（creating/completed/failed 等）
   */
  @IsOptional()
  @IsString()
  status?: string;
  /**
   * 关键词搜索（匹配职位/JD 内容）
   */
  @IsOptional()
  @IsString()
  keyword?: string;
}
