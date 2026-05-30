import {
  IsOptional,
  IsString,
  IsInt,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

export class TemplateQueryDto {
  /**
   * 页码
   */
  @IsOptional()
  page?: number;

  /**
   * 每页数量
   */
  @IsOptional()
  pageSize?: number;

  /**
   * 模板名称（模糊查询）
   */
  @IsString({ message: '模板名称必须是字符串' })
  @IsOptional()
  @MaxLength(50, { message: '模板名称长度不能超过50位' })
  name?: string;
}
