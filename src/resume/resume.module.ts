import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './entities/resume.entity';
import { Template, TemplateSchema } from '../template/entities/template.entity';
import { ResumeAi, ResumeAiSchema } from '../resume-ai/entities/resume-ai.entity';
import { ResumeEditRecord, ResumeEditRecordSchema } from '../resume-ai/entities/resume-edit-record.entity';
import { ResumeAnalysisRecord, ResumeAnalysisRecordSchema } from '../resume-ai/entities/resume-analysis-record.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      { name: Template.name, schema: TemplateSchema },
      { name: ResumeAi.name, schema: ResumeAiSchema },
      { name: ResumeEditRecord.name, schema: ResumeEditRecordSchema },
      { name: ResumeAnalysisRecord.name, schema: ResumeAnalysisRecordSchema },
    ]),
  ],
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
