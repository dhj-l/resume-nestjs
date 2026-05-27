import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
} from 'class-validator';
import { AiFunctionEnum } from '../entities/ai-usage-record.entity';

export class QueryAiUsageRecordDto {
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  pageSize?: number;

  @IsOptional()
  @IsMongoId({ message: '用户ID格式不正确' })
  userId?: string;

  @IsOptional()
  @IsEnum(AiFunctionEnum, { message: 'AI功能类型不正确' })
  aiFunction?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean({ message: 'success必须为布尔值' })
  success?: boolean;

  @IsOptional()
  @IsString()
  startDate?: string;

  @IsOptional()
  @IsString()
  endDate?: string;
}
