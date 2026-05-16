import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class PolishResumeDto {
  /**
   * 简历ID
   */
  @IsString()
  @IsNotEmpty()
  resumeId: string;

  /**
   * 模块key
   */
  @IsString()
  @IsNotEmpty()
  key: string;

  /**
   * 数组模块的下标（可选，数组模块必传）
   */
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  index?: number;

  /**
   * 修改描述（可选，告诉AI如何润色）
   */
  @IsOptional()
  @IsString()
  description?: string;
}
