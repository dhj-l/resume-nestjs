import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  QUESTION_COUNT_MAX,
  QUESTION_COUNT_MIN,
} from '../schemas/question.schema';

export class PredictQuestionsDto {
  /**
   * 简历ID
   */
  @IsString()
  @IsNotEmpty({ message: '简历ID不能为空' })
  resumeId: string;

  /**
   * 目标岗位JD
   */
  @IsString()
  @IsNotEmpty({ message: '岗位JD不能为空' })
  @MaxLength(2000, { message: '岗位JD最多2000字符' })
  jobDescription: string;

  /**
   * 手动选择的题目数量（8-15）
   */
  @IsInt({ message: '题目数量必须为整数' })
  @Min(QUESTION_COUNT_MIN, { message: `题目数量最少${QUESTION_COUNT_MIN}道` })
  @Max(QUESTION_COUNT_MAX, { message: `题目数量最多${QUESTION_COUNT_MAX}道` })
  questionCount: number;
}
