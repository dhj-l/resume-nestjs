import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateTemplateDto {
  /**
   * 模板名称
   */
  @IsString()
  @IsNotEmpty()
  name: string;

  /**
   * 模板预览图URL
   */
  @IsString()
  @IsOptional()
  previewImage: string;

  /**
   * 适用岗位类型
   */
  @IsString()
  @IsNotEmpty()
  category: string;

  /**
   * 对应简历ID
   */
  @IsString()
  @IsNotEmpty()
  resumeId: string;
}
