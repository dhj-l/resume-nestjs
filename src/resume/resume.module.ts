import { Module } from '@nestjs/common';
import { ResumeService } from './resume.service';
import { ResumeController } from './resume.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Resume, ResumeSchema } from './entities/resume.entity';
import { Template, TemplateSchema } from '../template/entities/template.entity';
import { ResumeAiModule } from '../resume-ai/resume-ai.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Resume.name, schema: ResumeSchema },
      { name: Template.name, schema: TemplateSchema },
    ]),
    ResumeAiModule,
  ],
  controllers: [ResumeController],
  providers: [ResumeService],
  exports: [ResumeService],
})
export class ResumeModule {}
