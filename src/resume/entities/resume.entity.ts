import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema, Types } from 'mongoose';
import { User } from '../../user/entities/user.entity';

export type ResumeDocument = Resume & Document;

@Schema({ _id: false })
export class GlobalStyle {
  @Prop()
  fontSize: string;

  @Prop()
  moduleMargin: string;

  @Prop()
  pageMargin: string;

  @Prop()
  lineHeight: string;
}

@Schema({ _id: false })
export class BasicInfo {
  @Prop()
  name: string;

  @Prop()
  gender: string;

  @Prop()
  phone: string;

  @Prop()
  age: string;

  @Prop()
  email: string;

  @Prop()
  avatar: string;

  @Prop()
  politicalStatus: string;

  @Prop()
  workYear: string;
}

@Schema({ _id: false })
export class JobIntention {
  @Prop()
  jobIntention: string;

  @Prop()
  intentionCity: string;

  @Prop()
  expectationSalary: string;

  @Prop()
  entryTime: string;
}

@Schema({ _id: false })
export class EducationBackground {
  @Prop()
  schoolName: string;

  @Prop()
  degree: string;

  @Prop()
  major: string;

  @Prop()
  enrollmentTime: string;

  @Prop()
  graduationTime: string;

  @Prop()
  content: string;
}

@Schema({ _id: false })
export class WorkExperience {
  @Prop()
  companyName: string;

  @Prop()
  position: string;

  @Prop()
  workTime: string;

  @Prop()
  dismissalTime: string;

  @Prop()
  workDescription: string;
}

@Schema({ _id: false })
export class CampusExperience {
  @Prop()
  startTime: string;

  @Prop()
  endTime: string;

  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop()
  content: string;
}

@Schema({ _id: false })
export class ProjectExperience {
  @Prop()
  startTime: string;

  @Prop()
  endTime: string;

  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop()
  content: string;
}

@Schema({ _id: false })
export class InternshipExperience {
  @Prop()
  startTime: string;

  @Prop()
  endTime: string;

  @Prop()
  companyName: string;

  @Prop()
  position: string;

  @Prop()
  description: string;
}

@Schema({ timestamps: true })
export class Resume {
  @Prop({ required: true })
  userId: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: Types.ObjectId;
  @Prop({ required: true })
  title: string;

  @Prop({ type: GlobalStyle })
  globalStyle: GlobalStyle;

  @Prop({ type: BasicInfo })
  basicInfo: BasicInfo;

  @Prop({ type: JobIntention })
  jobIntention: JobIntention;

  @Prop({ type: [EducationBackground], default: [] })
  educationBackground: EducationBackground[];

  @Prop({ type: [WorkExperience], default: [] })
  workExperience: WorkExperience[];

  @Prop({ type: [CampusExperience], default: [] })
  campusExperience: CampusExperience[];

  @Prop()
  skills: string;

  @Prop()
  certificates: string;

  @Prop({ type: [ProjectExperience], default: [] })
  projectExperience: ProjectExperience[];

  @Prop({ type: [InternshipExperience], default: [] })
  internshipExperience: InternshipExperience[];

  @Prop()
  selfEvaluation: string;
}

export const ResumeSchema = SchemaFactory.createForClass(Resume);
