import { Module, BadRequestException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ResumeAiModule } from 'src/resume-ai/resume-ai.module';

const ALLOWED_MIME_TYPES = [
  // 图片类型
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  // 文档类型
  'application/pdf',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Module({
  imports: [
    MulterModule.register({
      storage: diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = join(process.cwd(), 'uploads');
          if (!existsSync(uploadPath)) {
            mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          const ext = extname(file.originalname);
          cb(null, `${uniqueSuffix}${ext}`);
        },
      }),
      fileFilter: (req, file, cb) => {
        if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(
            new BadRequestException(
              `不支持的文件类型: ${file.mimetype}。允许的类型: ${ALLOWED_MIME_TYPES.join(', ')}`,
            ),
            false,
          );
        }
      },
      limits: {
        fileSize: MAX_FILE_SIZE,
      },
    }),
    ResumeAiModule,
  ],
  controllers: [UploadController],
  providers: [UploadService],
})
export class UploadModule {}
