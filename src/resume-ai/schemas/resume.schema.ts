import { z } from 'zod';

/** AI 生成的简历 schema — 核心字段必填，防止空结果或关键信息缺失 */
export const ResumeSchema = z
  .object({
    title: z.string().optional(),
    type: z.string().optional(),
    basicInfo: z
      .object({
        name: z.string(),
        gender: z.string().optional(),
        phone: z.string().optional(),
        age: z.string().optional(),
        email: z.string().optional(),
        avatar: z.string().optional(),
        politicalStatus: z.string().optional(),
        workYear: z.string().optional(),
      })
      .passthrough(),
    jobIntention: z
      .object({
        jobIntention: z.string().optional(),
        intentionCity: z.string().optional(),
        expectationSalary: z.string().optional(),
        entryTime: z.string().optional(),
      })
      .passthrough()
      .optional(),
    educationBackground: z.array(
      z
        .object({
          schoolName: z.string(),
          degree: z.string().optional(),
          major: z.string().optional(),
          enrollmentTime: z.string().optional(),
          graduationTime: z.string().optional(),
          content: z.string().optional(),
          globalSort: z.number().optional(),
          localSort: z.number().optional(),
        })
        .passthrough(),
    ),
    workExperience: z.array(
      z
        .object({
          companyName: z.string(),
          position: z.string(),
          workTime: z.string().optional(),
          dismissalTime: z.string().optional(),
          workDescription: z.string().optional(),
          globalSort: z.number().optional(),
          localSort: z.number().optional(),
        })
        .passthrough(),
    ),
    projectExperience: z
      .array(
        z
          .object({
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            content: z.string().optional(),
            globalSort: z.number().optional(),
            localSort: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    campusExperience: z
      .array(
        z
          .object({
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            title: z.string().optional(),
            description: z.string().optional(),
            content: z.string().optional(),
            globalSort: z.number().optional(),
            localSort: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    internshipExperience: z
      .array(
        z
          .object({
            startTime: z.string().optional(),
            endTime: z.string().optional(),
            companyName: z.string().optional(),
            position: z.string().optional(),
            description: z.string().optional(),
            globalSort: z.number().optional(),
            localSort: z.number().optional(),
          })
          .passthrough(),
      )
      .optional(),
    skills: z
      .object({
        content: z.string().optional(),
        globalSort: z.number().optional(),
      })
      .passthrough()
      .optional(),
    certificates: z
      .object({
        content: z.string().optional(),
        globalSort: z.number().optional(),
      })
      .passthrough()
      .optional(),
    selfEvaluation: z
      .object({
        content: z.string().optional(),
        globalSort: z.number().optional(),
      })
      .passthrough()
      .optional(),
    globalStyle: z
      .object({
        fontSize: z.string().optional(),
        moduleMargin: z.string().optional(),
        pageMargin: z.string().optional(),
        lineHeight: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AIResume = z.infer<typeof ResumeSchema>;
