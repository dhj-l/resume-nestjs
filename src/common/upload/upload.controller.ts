import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { type Express } from 'express';
import { type Request } from 'express';
import { DocumentParserService } from 'src/resume-ai/document-parser.service';
import { JwtAuthGuard } from 'src/auth/guards/jwt-auth.guard';

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(
    private readonly documentParserService: DocumentParserService,
    private readonly config: ConfigService,
  ) {}

  @Post('image')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    return {
      url: `/uploads/${file.filename}`,
    };
  }

  @Post('resume')
  @UseInterceptors(FileInterceptor('file'))
  async uploadResume(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const baseUrl =
      this.config.get<string>('BASE_URL') ||
      `${req.protocol}://${req.get('host')}`;

    const url = `${baseUrl}/uploads/${file.filename}`;
    const res = await this.documentParserService.parserDocument(url);
    return res;
  }
}
