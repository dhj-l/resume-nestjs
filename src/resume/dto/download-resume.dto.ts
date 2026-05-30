import { IsNotEmpty, IsString } from 'class-validator';

export class DownloadResumeDto {
  @IsString()
  @IsNotEmpty()
  html: string;

  @IsString()
  @IsNotEmpty()
  css: string;
}
