import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { unlink } from 'fs/promises';
import { type Express } from 'express';
import { DocumentParserService } from 'src/resume-ai/document-parser.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';
import { assertContentMatchesMime, readFileHeader } from './upload-validation';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly documentParserService: DocumentParserService) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    await this.assertStoredFileMatchesDeclaredType(file);

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
    await this.assertStoredFileMatchesDeclaredType(file);

    // 直接使用本地文件路径，避免 HTTP 自请求导致 502 错误
    const res = await this.documentParserService.parserDocument(file.path);
    return res;
  }

  /**
   * 落盘后按魔数校验真实内容（P0-6）
   *
   * 声明的 MIME 来自客户端、可以随意伪造，只有文件内容是可信的；
   * 校验不通过就把已经落盘的文件删掉，避免留下垃圾或可执行内容。
   */
  private async assertStoredFileMatchesDeclaredType(
    file: Express.Multer.File,
  ): Promise<void> {
    try {
      const header = await readFileHeader(file.path, 32);
      assertContentMatchesMime(file.mimetype, header);
    } catch (error) {
      await unlink(file.path).catch(() => undefined);
      throw error;
    }
  }
}
