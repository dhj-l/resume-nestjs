import { IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class GetResumeRecordsDto {
  @IsOptional()
  @Type(() => Number)
  page: number;
  @IsOptional()
  @Type(() => Number)
  pageSize: number;
}
