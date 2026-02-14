import { IsOptional, IsString } from 'class-validator';

export class TemplateQueryDto {
  @IsOptional()
  page?: number;

  @IsOptional()
  pageSize?: number;

  @IsString()
  @IsOptional()
  name?: string;
}
