import { ResumeSchema } from './resume.schema';
import { AnalysisSchema } from './analysis.schema';

describe('ResumeSchema', () => {
  /** 一份符合 prompt 约定的完整 AI 简历输出 */
  const validResume = {
    title: '前端开发工程师',
    basicInfo: {
      name: '张三',
      gender: '男',
      phone: '13800138000',
      email: 'zhangsan@example.com',
    },
    educationBackground: [
      {
        schoolName: '清华大学',
        degree: '本科',
        major: '计算机科学与技术',
        enrollmentTime: '2018-09',
        graduationTime: '2022-06',
      },
    ],
    workExperience: [
      {
        companyName: '某科技有限公司',
        position: '前端开发工程师',
        workTime: '2022-07',
        dismissalTime: '至今',
        workDescription: '负责公司核心产品的前端开发工作',
        globalSort: 1,
        localSort: 1,
      },
    ],
    jobIntention: {
      jobIntention: '高级前端工程师',
      intentionCity: '北京',
    },
    skills: { content: 'React、TypeScript、Node.js' },
    // AI 有时会返回额外字段
    extra_ai_field: 'should be allowed by passthrough',
  };

  it('应通过合法完整简历', () => {
    const result = ResumeSchema.safeParse(validResume);
    expect(result.success).toBe(true);
  });

  it('应通过带最少必填字段的简历（只有 name + educationBackground + workExperience）', () => {
    const minimal = {
      basicInfo: { name: '李四' },
      educationBackground: [{ schoolName: '北京大学' }],
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    };
    const result = ResumeSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it('应拒绝缺少 basicInfo 的简历', () => {
    const result = ResumeSchema.safeParse({
      title: '无姓名简历',
      educationBackground: [{ schoolName: '某大学' }],
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝缺少 basicInfo.name 的简历', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { phone: '13900001111' },
      educationBackground: [{ schoolName: '某大学' }],
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝缺少 educationBackground 的简历', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '王五' },
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝缺少 workExperience 的简历', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '赵六' },
      educationBackground: [{ schoolName: '某大学' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝 educationBackground 数组中元素缺少 schoolName', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '测试' },
      educationBackground: [{ degree: '本科' }],
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝 workExperience 数组中元素缺少 companyName', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '测试' },
      educationBackground: [{ schoolName: '某大学' }],
      workExperience: [{ position: '工程师' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝 workExperience 数组中元素缺少 position', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '测试' },
      educationBackground: [{ schoolName: '某大学' }],
      workExperience: [{ companyName: '某公司' }],
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝 basicInfo.name 为数字类型', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: 12345 },
      educationBackground: [{ schoolName: '某大学' }],
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    });
    expect(result.success).toBe(false);
  });

  it('应通过空数组 educationBackground（AI 可能返回空数组）', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '测试' },
      educationBackground: [],
      workExperience: [{ companyName: '某公司', position: '工程师' }],
    });
    expect(result.success).toBe(true);
  });

  it('应通过空数组 workExperience（AI 可能返回空数组）', () => {
    const result = ResumeSchema.safeParse({
      basicInfo: { name: '应届生' },
      educationBackground: [{ schoolName: '某大学' }],
      workExperience: [],
    });
    expect(result.success).toBe(true);
  });
});

describe('AnalysisSchema', () => {
  const validAnalysis = {
    meta: { candidate_name: '张三', target_position: '前端工程师' },
    overall_score: 78,
    competitiveness_level: 'strong',
    dimension_scores: [
      {
        name: '技术能力',
        score: 80,
        max: 100,
        weight: 0.4,
        comment: '技术扎实',
      },
      {
        name: '项目经验',
        score: 75,
        max: 100,
        weight: 0.35,
        comment: '经验丰富',
      },
    ],
    strengths: [{ category: '技术', title: 'React 精通', detail: '5 年经验' }],
    weaknesses: [],
    summary: '整体评价良好',
  };

  it('应通过合法分析报告', () => {
    const result = AnalysisSchema.safeParse(validAnalysis);
    expect(result.success).toBe(true);
  });

  it('应通过 overall_score 为 0 边界值', () => {
    const result = AnalysisSchema.safeParse({
      ...validAnalysis,
      overall_score: 0,
    });
    expect(result.success).toBe(true);
  });

  it('应通过 overall_score 为 100 边界值', () => {
    const result = AnalysisSchema.safeParse({
      ...validAnalysis,
      overall_score: 100,
    });
    expect(result.success).toBe(true);
  });

  it('应拒绝 overall_score 为负数', () => {
    const result = AnalysisSchema.safeParse({
      ...validAnalysis,
      overall_score: -1,
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝 overall_score 超过 100', () => {
    const result = AnalysisSchema.safeParse({
      ...validAnalysis,
      overall_score: 101,
    });
    expect(result.success).toBe(false);
  });

  it('应拒绝 dimension_scores 中 score 为负数', () => {
    const bad = {
      ...validAnalysis,
      dimension_scores: [{ name: '技术', score: -5, max: 100, weight: 0.4 }],
    };
    const result = AnalysisSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('应拒绝 dimension_scores 中 max 为 0', () => {
    const bad = {
      ...validAnalysis,
      dimension_scores: [{ name: '技术', score: 80, max: 0, weight: 0.4 }],
    };
    const result = AnalysisSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('应拒绝 dimension_scores 中 weight 超过 1', () => {
    const bad = {
      ...validAnalysis,
      dimension_scores: [{ name: '技术', score: 80, max: 100, weight: 1.5 }],
    };
    const result = AnalysisSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('应拒绝 dimension_scores 中 weight 为负数', () => {
    const bad = {
      ...validAnalysis,
      dimension_scores: [{ name: '技术', score: 80, max: 100, weight: -0.1 }],
    };
    const result = AnalysisSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('应通过仅有必填字段的最简分析报告（所有顶层字段均可选）', () => {
    const result = AnalysisSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});
