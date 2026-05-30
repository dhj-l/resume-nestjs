import { IsString, IsNotEmpty } from 'class-validator';

export class UndoEditDto {
  /**
   * 编辑记录ID
   */
  @IsString()
  @IsNotEmpty()
  recordId: string;

  /**
   * 简历ID
   */
  @IsString()
  @IsNotEmpty()
  resumeId: string;
}
