import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';

export class GlobalStyleDto {
  @IsString()
  @IsOptional()
  fontSize: string;

  @IsString()
  @IsOptional()
  moduleMargin: string;

  @IsString()
  @IsOptional()
  pageMargin: string;

  @IsString()
  @IsOptional()
  lineHeight: string;
}

export class BasicInfoDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  gender: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsOptional()
  age: string;

  @IsString()
  @IsOptional()
  email: string;

  @IsString()
  @IsOptional()
  avatar: string;

  @IsString()
  @IsOptional()
  politicalStatus: string;

  @IsString()
  @IsOptional()
  workYear: string;
}

export class JobIntentionDto {
  @IsString()
  @IsOptional()
  jobIntention: string;

  @IsString()
  @IsOptional()
  intentionCity: string;

  @IsString()
  @IsOptional()
  expectationSalary: string;

  @IsString()
  @IsOptional()
  entryTime: string;
}

export class EducationBackgroundDto {
  @IsString()
  @IsOptional()
  schoolName: string;

  @IsString()
  @IsOptional()
  degree: string;

  @IsString()
  @IsOptional()
  major: string;

  @IsString()
  @IsOptional()
  enrollmentTime: string;

  @IsString()
  @IsOptional()
  graduationTime: string;

  @IsString()
  @IsOptional()
  content: string;
}

export class WorkExperienceDto {
  @IsString()
  @IsOptional()
  companyName: string;

  @IsString()
  @IsOptional()
  position: string;

  @IsString()
  @IsOptional()
  workTime: string;

  @IsString()
  @IsOptional()
  dismissalTime: string;

  @IsString()
  @IsOptional()
  workDescription: string;
}

export class CampusExperienceDto {
  @IsString()
  @IsOptional()
  startTime: string;

  @IsString()
  @IsOptional()
  endTime: string;

  @IsString()
  @IsOptional()
  title: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsOptional()
  content: string;
}

export class ProjectExperienceDto {
  @IsString()
  @IsOptional()
  startTime: string;

  @IsString()
  @IsOptional()
  endTime: string;

  @IsString()
  @IsOptional()
  title: string;

  @IsString()
  @IsOptional()
  description: string;

  @IsString()
  @IsOptional()
  content: string;
}

export class InternshipExperienceDto {
  @IsString()
  @IsOptional()
  startTime: string;

  @IsString()
  @IsOptional()
  endTime: string;

  @IsString()
  @IsOptional()
  companyName: string;

  @IsString()
  @IsOptional()
  position: string;

  @IsString()
  @IsOptional()
  description: string;
}

export class CreateResumeDto {
  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @ValidateNested()
  @Type(() => GlobalStyleDto)
  @IsOptional()
  globalStyle: GlobalStyleDto;

  @ValidateNested()
  @Type(() => BasicInfoDto)
  @IsOptional()
  basicInfo: BasicInfoDto;

  @ValidateNested()
  @Type(() => JobIntentionDto)
  @IsOptional()
  jobIntention: JobIntentionDto;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EducationBackgroundDto)
  @IsOptional()
  educationBackground: EducationBackgroundDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WorkExperienceDto)
  @IsOptional()
  workExperience: WorkExperienceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CampusExperienceDto)
  @IsOptional()
  campusExperience: CampusExperienceDto[];

  @IsString()
  @IsOptional()
  skills: string;

  @IsString()
  @IsOptional()
  certificates: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProjectExperienceDto)
  @IsOptional()
  projectExperience: ProjectExperienceDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InternshipExperienceDto)
  @IsOptional()
  internshipExperience: InternshipExperienceDto[];

  @IsString()
  @IsOptional()
  selfEvaluation: string;
}
