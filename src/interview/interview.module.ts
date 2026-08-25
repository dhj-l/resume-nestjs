import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AiModule } from 'src/ai/ai.module';
import {
  InterviewSession,
  InterviewSessionSchema,
} from './entities/interview-session.entity';
import { InterviewController } from './interview.controller';
import { InterviewService } from './interview.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { schema: InterviewSessionSchema, name: InterviewSession.name },
    ]),
    AiModule,
  ],
  controllers: [InterviewController],
  providers: [InterviewService],
})
export class InterviewModule {}
