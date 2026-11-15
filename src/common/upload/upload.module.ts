import { Module, BadRequestException } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { ResumeAiModule } from 'src/resume-ai/resume-ai.module';
import { ALLOWED_MIME_TYPES, extensionForMime } from './upload-validation';

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
          // 扩展名由声明的 MIME 白名单推导，绝不使用 originalname ——
          // 否则 evil.html 会被原样写进公开静态目录，形成同源存储型 XSS。
          // 非白名单类型在 fileFilter 已经拦下，这里再兜一层。
          let extension: string;
          try {
            extension = extensionForMime(file.mimetype);
          } catch {
            return cb(
              new BadRequestException(`不支持的文件类型: ${file.mimetype}`),
              '',
            );
          }
          cb(null, `${uniqueSuffix}${extension}`);
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
