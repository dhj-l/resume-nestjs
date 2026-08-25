import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  InterviewSession,
  InterviewSessionDocument,
} from './entities/interview-session.entity';

@Injectable()
export class InterviewService {
  constructor(
    @InjectModel(InterviewSession.name)
    private readonly sessionModel: Model<InterviewSessionDocument>,
  ) {}
}
