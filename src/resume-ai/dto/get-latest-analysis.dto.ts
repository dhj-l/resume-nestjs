import { IsString, IsNotEmpty } from 'class-validator';

export class GetLatestAnalysisDto {
  /**
   * 简历ID
   */
  @IsString()
  @IsNotEmpty({ message: '简历ID不能为空' })
  resumeId: string;
}
