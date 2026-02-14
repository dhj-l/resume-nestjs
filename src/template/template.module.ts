import { Module } from '@nestjs/common';
import { TemplateService } from './template.service';
import { TemplateController } from './template.controller';
import { MongooseModule } from '@nestjs/mongoose';
import { Template, TemplateSchema } from './entities/template.entity';
import { ResumeModule } from '../resume/resume.module';
import { Resume } from 'src/resume/entities/resume.entity';
import { ResumeSchema } from 'src/resume/entities/resume.entity';
import { User } from 'src/user/entities/user.entity';
import { UserSchema } from 'src/user/entities/user.entity';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Template.name, schema: TemplateSchema },
      {
        name: Resume.name,
        schema: ResumeSchema,
      },
      {
        name: User.name,
        schema: UserSchema,
      },
    ]),
    ResumeModule,
  ],
  controllers: [TemplateController],
  providers: [TemplateService],
})
export class TemplateModule {}
