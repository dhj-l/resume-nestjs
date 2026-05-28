import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { User, UserSchema } from '../user/entities/user.entity';
import { Resume, ResumeSchema } from '../resume/entities/resume.entity';
import { Template, TemplateSchema } from '../template/entities/template.entity';
import {
  AiUsageRecord,
  AiUsageRecordSchema,
} from '../resume-ai/entities/ai-usage-record.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: User.name, schema: UserSchema },
      { name: Resume.name, schema: ResumeSchema },
      { name: Template.name, schema: TemplateSchema },
      { name: AiUsageRecord.name, schema: AiUsageRecordSchema },
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
