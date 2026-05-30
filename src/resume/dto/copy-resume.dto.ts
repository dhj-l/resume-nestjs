import { IsOptional, IsString } from 'class-validator';

/**
 * 复制简历请求 DTO
 * 可选传入新标题，不传则默认使用“原标题 (副本)”
 */
export class CopyResumeDto {
  @IsString()
  @IsOptional()
  title?: string;
}
