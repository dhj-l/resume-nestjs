import { validateJobDescriptionText } from './job-description.validator';

const validJd = `前端开发工程师（Node.js 方向）
工作地点：上海
公司介绍：某互联网公司，专注于 AI 与数据平台产品研发。
职位描述：
1、负责服务端接口与 BFF 层研发；
2、参与性能优化和架构升级。
任职要求：
1、本科及以上学历；
2、熟悉 Node.js 与数据库设计。
薪资范围：25k-40k。`;

describe('validateJobDescriptionText - 模拟面试 JD 校验', () => {
  it('should accept a complete JD with required fields', () => {
    const result = validateJobDescriptionText(validJd);
    expect(result.isValid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('should reject an overly long JD', () => {
    const result = validateJobDescriptionText('职'.repeat(6000));
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('过长');
  });

  it('should reject a too-short JD', () => {
    const result = validateJobDescriptionText('招聘后端工程师');
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('过短');
  });

  it('should reject a JD missing essential keyword groups', () => {
    // 长度足够、有段落，但缺少职责/要求/薪资等关键字段
    const noKeywords = `我们是一家充满活力与创造力的科技公司，团队氛围融洽，办公环境舒适。\n\n${'这里描述了很多与岗位无关的公司日常活动、团建安排与企业文化宣传内容。'.repeat(8)}`;
    const result = validateJobDescriptionText(noKeywords);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('关键信息');
  });

  it('should reject a JD without paragraphs or line breaks', () => {
    const singleLine = `${'前端开发工程师负责岗位职责与任职要求中的各项内容，工作地点上海，薪资范围面议，公司提供良好的发展空间与福利待遇。'.repeat(3)}`;
    const result = validateJobDescriptionText(singleLine);
    expect(result.isValid).toBe(false);
    expect(result.reason).toContain('格式异常');
  });
});
