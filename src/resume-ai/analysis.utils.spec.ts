import {
  ANALYSIS_INPUT_BUDGET,
  ANALYSIS_INPUT_BUDGET_FALLBACK,
  buildTruncatedAnalysisContext,
  normalizeAnalysisResult,
} from './analysis.utils';

describe('buildTruncatedAnalysisContext', () => {
  const resume = {
    basicInfo: { name: '张三', phone: '13800138000' },
    jobIntention: { position: '前端开发工程师' },
    educationBackground: [{ school: '上海交通大学', degree: '本科' }],
    workExperience: [],
    projectExperience: [],
    skills: ['Vue', 'TypeScript'],
    certificates: [],
    selfEvaluation: '认真负责',
    campusExperience: [],
    internshipExperience: [],
  };

  it('内容不超预算时保持完整', () => {
    const { resumeContent } = buildTruncatedAnalysisContext(
      resume,
      'JD',
      ANALYSIS_INPUT_BUDGET,
    );
    expect(resumeContent).toContain('"basicInfo"');
    expect(resumeContent).toContain('"workExperience"');
    expect(resumeContent.length).toBeLessThanOrEqual(ANALYSIS_INPUT_BUDGET);
    expect(resumeContent).not.toContain('已截断');
  });

  it('超预算时保留全部顶层章节且不超限', () => {
    const bigResume = {
      ...resume,
      workExperience: Array.from({ length: 20 }, (_, i) => ({
        company: `某某公司${i}`,
        description: '负责核心业务的前端开发与架构设计，'.repeat(80),
      })),
      projectExperience: Array.from({ length: 20 }, (_, i) => ({
        name: `项目${i}`,
        detail: '独立完成从需求分析到上线的全流程，'.repeat(80),
      })),
    };
    const { resumeContent } = buildTruncatedAnalysisContext(
      bigResume,
      'JD',
      ANALYSIS_INPUT_BUDGET,
    );
    expect(resumeContent.length).toBeLessThanOrEqual(ANALYSIS_INPUT_BUDGET);
    for (const key of [
      'basicInfo',
      'jobIntention',
      'educationBackground',
      'workExperience',
      'projectExperience',
      'skills',
      'certificates',
      'selfEvaluation',
      'campusExperience',
      'internshipExperience',
    ]) {
      expect(resumeContent).toContain(`"${key}"`);
    }
    expect(resumeContent).toContain('已截断');
  });

  it('兜底预算 4000 时同样不超限', () => {
    const bigResume = {
      ...resume,
      workExperience: [
        { company: '某某公司', description: '核心业务开发。'.repeat(3000) },
      ],
    };
    const { resumeContent } = buildTruncatedAnalysisContext(
      bigResume,
      'JD',
      ANALYSIS_INPUT_BUDGET_FALLBACK,
    );
    expect(resumeContent.length).toBeLessThanOrEqual(
      ANALYSIS_INPUT_BUDGET_FALLBACK,
    );
  });

  it('JD 超长时截断到预算内并带提示', () => {
    const { jobDescription } = buildTruncatedAnalysisContext(
      resume,
      '岗位要求'.repeat(5000),
      ANALYSIS_INPUT_BUDGET,
    );
    expect(jobDescription.length).toBeLessThanOrEqual(ANALYSIS_INPUT_BUDGET);
    expect(jobDescription).toContain('已截断');
  });
});

describe('normalizeAnalysisResult', () => {
  it('补齐缺失的数组与对象字段', () => {
    const result = normalizeAnalysisResult({});
    expect(result.dimension_scores).toEqual([]);
    expect(result.strengths).toEqual([]);
    expect(result.weaknesses).toEqual([]);
    expect(result.suggestions).toEqual([]);
    expect(result.key_findings).toEqual([]);
    expect(result.market_analysis).toEqual({});
    expect(result.technology_assessment).toEqual({});
    expect(result.career_analysis).toEqual({});
    expect(result.meta).toEqual({});
    expect(result.summary).toBe('');
  });

  it('overall_score 缺失时按维度加权计算', () => {
    const result = normalizeAnalysisResult({
      dimension_scores: [
        { score: 80, weight: 0.25 },
        { score: 60, weight: 0.75 },
      ],
    });
    expect(result.overall_score).toBe(65);
  });

  it('保留已有的 overall_score', () => {
    const result = normalizeAnalysisResult({ overall_score: 88 });
    expect(result.overall_score).toBe(88);
  });
});
