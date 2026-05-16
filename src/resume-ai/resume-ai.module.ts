import { Module } from '@nestjs/common';
import { ResumeAiService } from './resume-ai.service';
import { ResumeAiController } from './resume-ai.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { ResumeAi, ResumeAiSchema } from './entities/resume-ai.entity';
import { AiModule } from 'src/ai/ai.module';
import { Resume, ResumeSchema } from 'src/resume/entities/resume.entity';
import { DocumentParserService } from './document-parser.service';
import {
  ResumeEditRecord,
  ResumeEditRecordSchema,
} from './entities/resume-edit-record.entity';
@Module({
  imports: [
    MongooseModule.forFeature([
      { schema: ResumeAiSchema, name: ResumeAi.name },
      {
        schema: ResumeSchema,
        name: Resume.name,
      },
      {
        schema: ResumeEditRecordSchema,
        name: ResumeEditRecord.name,
      },
    ]),
    AiModule,
  ],
  controllers: [ResumeAiController],
  providers: [ResumeAiService, DocumentParserService],
  exports: [DocumentParserService],
})
export class ResumeAiModule {}
