import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { type Express } from 'express';
import { DocumentParserService } from 'src/resume-ai/document-parser.service';

@Controller('upload')
export class UploadController {
  constructor(private readonly documentParserService: DocumentParserService) {}
  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    // Return relative path (URL)
    // Assuming we serve static files under /uploads prefix
    return {
      url: `/uploads/${file.filename}`,
    };
  }
  @Post('resume')
  @UseInterceptors(FileInterceptor('file'))
  async uploadResume(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    //TODO: 后续将硬编码替换成环境变量
    const url = `http://localhost:3000/uploads/${file.filename}`;
    //解析
    const res = await this.documentParserService.parserDocument(url);
    return res;
  }
}
