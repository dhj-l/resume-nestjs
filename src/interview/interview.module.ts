import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from 'src/ai/ai.module';
import { Resume, ResumeSchema } from 'src/resume/entities/resume.entity';
import {
  InterviewSession,
  InterviewSessionSchema,
} from './entities/interview-session.entity';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';
import { QuestionEngineService } from './services/question-engine.service';
import { EvaluationService } from './services/evaluation.service';
import { InterviewTimeoutScheduler } from './interview-timeout.scheduler';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    MongooseModule.forFeature([
      { schema: InterviewSessionSchema, name: InterviewSession.name },
      { schema: ResumeSchema, name: Resume.name },
    ]),
    AiModule,
  ],
  controllers: [InterviewController],
  providers: [
    InterviewService,
    QuestionEngineService,
    EvaluationService,
    InterviewTimeoutScheduler,
  ],
})
export class InterviewModule {}
