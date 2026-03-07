import { IsNumber, IsOptional } from 'class-validator';

export class GetResumeDto {
  @IsOptional()
  page: number;
  @IsOptional()
  pageSize: number;
}
