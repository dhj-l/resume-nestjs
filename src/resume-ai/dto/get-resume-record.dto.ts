import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetResumeRecordsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'page 必须为整数' })
  @Min(1, { message: 'page 不能小于 1' })
  page: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'pageSize 必须为整数' })
  @Min(1, { message: 'pageSize 不能小于 1' })
  @Max(100, { message: 'pageSize 不能大于 100' })
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
