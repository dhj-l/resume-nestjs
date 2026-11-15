import { toResumeRecordResponse } from './resume-records.mapper';

describe('toResumeRecordResponse', () => {
  it('已完成记录应把 generatedResumeId 映射为 resumeId 并保留其他字段', () => {
    const record = {
      _id: 'rec-1',
      jobDescription: '前端开发工程师',
      status: 'completed',
      templateType: 'default',
      generatedResumeId: 'resume-1',
    };

    const result = toResumeRecordResponse(record);

    expect(result.resumeId).toBe('resume-1');
    expect(result.jobDescription).toBe('前端开发工程师');
    expect(result.generatedResumeId).toBe('resume-1');
  });

  it('选择已有简历但尚未生成完成时保留原 resumeId', () => {
    const record = {
      _id: 'rec-2',
      parseType: 'select',
      status: 'creating',
      resumeId: 'source-1',
    };

    const result = toResumeRecordResponse(record);

    expect(result.resumeId).toBe('source-1');
  });

  it('既无生成简历 ID 也无源简历 ID 时不回传 resumeId', () => {
    const record = {
      _id: 'rec-3',
      status: 'failed',
    };

    const result = toResumeRecordResponse(record);

    expect(result.resumeId).toBeUndefined();
  });
});
