# 简历字段对象化重构 Spec

## Why
当前简历实体中的 `skills`（技能特长）、`certificates`（荣誉证书）和 `selfEvaluation`（自我评价）字段为简单字符串类型，缺少排序字段支持。为了与项目中其他模块（如教育背景、工作经验等）保持一致的数据结构风格，并支持这些模块的全局排序功能，需要将这三个字段重构为对象结构。

## What Changes
- 将 `skills` 字段从 `string` 类型重构为 `Skills` 对象类型，包含 `content` 和 `globalSort` 字段
- 将 `certificates` 字段从 `string` 类型重构为 `Certificates` 对象类型，包含 `content` 和 `globalSort` 字段
- 将 `selfEvaluation` 字段从 `string` 类型重构为 `SelfEvaluation` 对象类型，包含 `content` 和 `globalSort` 字段
- 更新 `resume.entity.ts` 实体定义
- 更新 `update-resume.dto.ts` DTO 定义
- 更新 `create-resume.dto.ts` DTO 定义
- 更新 `resume_ai.ts` prompt 模板中的 JSON 结构示例
- 确保向后兼容现有数据

## Impact
- Affected specs: 简历数据结构、简历创建/更新逻辑、AI 生成简历逻辑
- Affected code:
  - `src/resume/entities/resume.entity.ts`
  - `src/resume/dto/update-resume.dto.ts`
  - `src/resume/dto/create-resume.dto.ts`
  - `src/resume-ai/prompt/resume_ai.ts`
  - `src/resume-ai/resume-ai.service.ts`

## ADDED Requirements

### Requirement: 对象化字段数据结构
系统 SHALL 为 `skills`、`certificates` 和 `selfEvaluation` 字段提供对象化的数据结构：

**Skills（技能特长）**
```typescript
@Schema({ _id: false })
export class Skills {
  @Prop({ default: '' })
  content: string;

  @Prop({ default: 0 })
  globalSort: number;
}
```

**Certificates（荣誉证书）**
```typescript
@Schema({ _id: false })
export class Certificates {
  @Prop({ default: '' })
  content: string;

  @Prop({ default: 0 })
  globalSort: number;
}
```

**SelfEvaluation（自我评价）**
```typescript
@Schema({ _id: false })
export class SelfEvaluation {
  @Prop({ default: '' })
  content: string;

  @Prop({ default: 0 })
  globalSort: number;
}
```

#### Scenario: 字段默认值
- **WHEN** 创建新简历时未提供这些字段
- **THEN** 系统应使用默认值：`content` 为空字符串，`globalSort` 为 0

#### Scenario: 字段更新
- **WHEN** 用户更新简历数据时
- **THEN** 系统应正确保存对象化字段的所有属性

### Requirement: globalSort 排序规则
对象化字段的 `globalSort` 字段 SHALL 遵循以下默认规则：
- `skills`: 默认 globalSort = 6
- `certificates`: 默认 globalSort = 7
- `selfEvaluation`: 默认 globalSort = 8

数值越小优先级越高（越靠前显示）。

### Requirement: 向后兼容
系统 SHALL 保证现有数据的兼容性：
- 现有简历数据在读取时应能正常工作
- 对于旧数据格式（字符串类型），系统应能自动转换或兼容处理
- 缺少 `globalSort` 字段的旧数据应使用默认值 0

## MODIFIED Requirements

### Requirement: 简历实体数据结构
`Resume` 实体类需要修改以下字段定义：

**修改前：**
```typescript
@Prop({ default: '' })
skills: string;

@Prop({ default: '' })
certificates: string;

@Prop({ default: '' })
selfEvaluation: string;
```

**修改后：**
```typescript
@Prop({ type: Skills, default: {} })
skills: Skills;

@Prop({ type: Certificates, default: {} })
certificates: Certificates;

@Prop({ type: SelfEvaluation, default: {} })
selfEvaluation: SelfEvaluation;
```

### Requirement: DTO 数据验证
更新相关的 DTO 类，创建新的嵌套 DTO 类：
- `SkillsDto`: 包含 `content` (string, optional) 和 `globalSort` (number, optional)
- `CertificatesDto`: 包含 `content` (string, optional) 和 `globalSort` (number, optional)
- `SelfEvaluationDto`: 包含 `content` (string, optional) 和 `globalSort` (number, optional)

使用 `@ValidateNested()` 和 `@Type()` 装饰器进行嵌套验证。

### Requirement: AI Prompt 更新
更新 `resume_ai.ts` 中的 JSON 结构示例，将：
```json
"skills": "<ul><li>...</li></ul>",
"certificates": "<ul><li>...</li></ul>",
"selfEvaluation": "<p>...</p>"
```

修改为：
```json
"skills": {
  "content": "<ul><li>...</li></ul>",
  "globalSort": 6
},
"certificates": {
  "content": "<ul><li>...</li></ul>",
  "globalSort": 7
},
"selfEvaluation": {
  "content": "<p>...</p>",
  "globalSort": 8
}
```

## REMOVED Requirements
无移除的需求。
