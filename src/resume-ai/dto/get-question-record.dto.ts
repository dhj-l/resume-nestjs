import { IsNotEmpty, IsString } from 'class-validator';

export class GetQuestionDetailDto {
  /**
   * 押题记录ID
   */
  @IsString()
  @IsNotEmpty({ message: '押题记录ID不能为空' })
  id: string;
}

export class GetLatestQuestionDto {
  /**
   * 简历ID
   */
  @IsString()
  @IsNotEmpty({ message: '简历ID不能为空' })
  resumeId: string;
}
