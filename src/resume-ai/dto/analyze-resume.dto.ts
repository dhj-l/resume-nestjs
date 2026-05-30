import { IsString, IsNotEmpty } from 'class-validator';

export class AnalyzeResumeDto {
  /**
   * 简历ID
   */
  @IsString()
  @IsNotEmpty()
  resumeId: string;

  /**
   * 目标岗位JD
   */
  @IsString()
  @IsNotEmpty()
  jobDescription: string;
}
