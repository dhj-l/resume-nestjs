# 简历内容验证功能实现计划

## 1. 需求概述

实现一个简历内容验证函数，用于准确判断用户提供的内容是否为有效的简历文档，而非其他类型的内容。该函数需要分析简历的结构元素、内容相关性和格式特征，返回布尔值结果以及详细的验证指标。

## 2. 参考实现模式

参考 `validateJobDescription` 函数的实现模式：
- 支持中英文双语
- 使用常量文件管理阈值和消息
- 返回结构化结果：`{ isValid, reason, errors, score }`
- 使用关键词组匹配进行内容验证
- 采用评分机制综合判断

## 3. 实现方案

### 3.1 创建简历验证常量文件

**文件路径**: `src/resume-ai/constants/resume-validation.constants.ts`

**内容包含**:
- 长度阈值（最小/最大字符数）
- 简历关键词组（个人信息、教育背景、工作经历、技能、项目经历等）
- 必需关键词数量
- 简历特征关键词（日期格式、联系方式格式等）
- 验证消息（中英文）

### 3.2 实现验证函数

**文件路径**: `src/resume-ai/resume-ai.service.ts`

**函数签名**:
```typescript
validateResumeContent(
  resumeContent: string,
  language: 'CN' | 'EN' = 'CN',
): { isValid: boolean; reason: string; errors: string[]; score: number; details: ValidationDetails }
```

**验证维度**:

| 维度 | 检查内容 | 权重 |
|------|----------|------|
| 长度检查 | 内容长度在合理范围内 | 15分 |
| 个人信息 | 姓名、联系方式等 | 20分 |
| 教育背景 | 学校、学历、专业等 | 15分 |
| 工作经历 | 公司、职位、时间等 | 15分 |
| 技能特长 | 技能描述 | 10分 |
| 时间格式 | 日期格式合理性 | 10分 |
| 结构完整性 | 段落和换行 | 15分 |

### 3.3 创建单元测试

**文件路径**: `src/resume-ai/resume-ai.service.spec.ts`

**测试用例覆盖**:
- 有效简历（中文）
- 有效简历（英文）
- 非简历内容（文章、JD等）
- 格式错误的简历
- 缺少关键信息的简历
- 边界情况（空内容、超长内容）

## 4. 详细任务列表

### 任务 1: 创建简历验证常量文件
- 定义长度阈值常量
- 定义简历关键词组（个人信息、教育、工作、技能等）
- 定义时间格式正则表达式
- 定义验证消息（中英文）
- 导出辅助函数

### 任务 2: 实现验证函数
- 在 `resume-ai.service.ts` 中添加 `validateResumeContent` 方法
- 实现长度验证逻辑
- 实现关键词组匹配逻辑
- 实现时间格式检测
- 实现评分计算
- 返回详细验证结果

### 任务 3: 创建单元测试
- 创建测试文件
- 编写有效简历测试用例
- 编写非简历内容测试用例
- 编写格式错误测试用例
- 编写边界情况测试用例

## 5. 验证结果结构

```typescript
interface ValidationDetails {
  hasPersonalInfo: boolean;
  hasEducation: boolean;
  hasWorkExperience: boolean;
  hasSkills: boolean;
  hasTimeFormat: boolean;
  matchedKeywordGroups: string[];
  contentLength: number;
  paragraphCount: number;
}

interface ValidationResult {
  isValid: boolean;
  reason: string;
  errors: string[];
  score: number;
  details: ValidationDetails;
}
```

## 6. 简历关键词组设计

| 组名 | 中文关键词 | 英文关键词 |
|------|-----------|-----------|
| personalInfo | 姓名、电话、手机、邮箱、联系方式、性别、年龄 | name, phone, email, contact, gender, age |
| education | 学校、大学、学院、学历、专业、毕业、学位 | university, college, education, degree, major, graduated |
| workExperience | 工作、公司、职位、岗位、任职、离职、在职 | work, company, position, job, employment, experience |
| skills | 技能、特长、能力、熟练、掌握、熟悉 | skills, abilities, proficient, expert, master |
| project | 项目、负责、参与、开发、实现 | project, developed, implemented, responsible |
| selfEvaluation | 自我评价、个人总结、职业规划 | self-evaluation, summary, career, objective |
| timeFormat | 日期格式检测（正则） | 日期格式检测（正则） |

## 7. 预期验证逻辑

```
1. 长度检查
   - 过短 (< 100字符): 返回错误
   - 过长 (> 10000字符): 返回错误
   - 合格: +15分

2. 个人信息检查
   - 检测姓名关键词
   - 检测联系方式（电话/邮箱格式）
   - 至少匹配一项: +20分

3. 教育背景检查
   - 检测学校关键词
   - 检测学历关键词
   - 至少匹配一项: +15分

4. 工作经历检查
   - 检测公司关键词
   - 检测职位关键词
   - 至少匹配一项: +15分

5. 技能特长检查
   - 检测技能关键词
   - 匹配: +10分

6. 时间格式检查
   - 检测日期格式 (YYYY-MM, YYYY/MM, YYYY年MM月等)
   - 至少包含2个日期: +10分

7. 结构完整性检查
   - 段落数 >= 3 或换行符 >= 10
   - 合格: +15分

最终判定:
- score >= 60 且无严重错误: isValid = true
- 否则: isValid = false
```

## 8. 文件变更清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `src/resume-ai/constants/resume-validation.constants.ts` | 新建 | 简历验证常量 |
| `src/resume-ai/resume-ai.service.ts` | 修改 | 添加验证函数 |
| `src/resume-ai/resume-ai.service.spec.ts` | 新建 | 单元测试 |

## 9. 风险与注意事项

1. **误判风险**: 某些非简历内容可能包含类似关键词，需通过多维度综合判断降低误判率
2. **语言混合**: 简历可能中英文混合，需同时检测两种语言的关键词
3. **格式多样**: 简历格式千差万别，需设置合理的阈值避免过于严格
4. **向后兼容**: 新增验证功能不应影响现有业务逻辑
