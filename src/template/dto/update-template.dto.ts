import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsUrl,
} from 'class-validator';

export class UpdateTemplateDto {
  /**
   * 模板名称
   */
  @IsString({ message: '模板名称必须是字符串' })
  @IsOptional()
  @MinLength(2, { message: '模板名称长度至少为2位' })
  @MaxLength(50, { message: '模板名称长度不能超过50位' })
  name?: string;

  /**
   * 模板预览图URL
   */
  @IsString({ message: '预览图URL必须是字符串' })
  @IsOptional()
  @IsUrl({}, { message: '预览图URL格式不正确' })
  @MaxLength(500, { message: '预览图URL长度不能超过500位' })
  previewImage?: string;

  /**
   * 适用岗位类型
   */
  @IsString({ message: '岗位类型必须是字符串' })
  @IsOptional()
  @MinLength(2, { message: '岗位类型长度至少为2位' })
  @MaxLength(100, { message: '岗位类型长度不能超过100位' })
  category?: string;

  /**
   * 对应简历ID
   */
  @IsString({ message: '简历ID必须是字符串' })
  @IsOptional()
  resumeId?: string;
}
