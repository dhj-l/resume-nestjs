import { IsString, IsNotEmpty, IsMongoId } from 'class-validator';

export class GetAnalysisDetailDto {
  @IsString()
  @IsNotEmpty({ message: '分析记录ID不能为空' })
  @IsMongoId({ message: '分析记录ID格式不正确' })
  id: string;
}
