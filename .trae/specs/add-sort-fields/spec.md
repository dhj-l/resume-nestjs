# 简历排序字段功能 Spec

## Why
当前简历实体中的数组类型数据（教育背景、工作经验、校园经历、项目经历、实习经历）缺少排序字段，用户无法自定义这些内容的显示顺序。需要为数组中的每一项添加排序字段，以支持灵活的内容排序功能。

## What Changes
- 为 `EducationBackground` 实体添加 `globalSort` 和 `localSort` 字段
- 为 `WorkExperience` 实体添加 `globalSort` 和 `localSort` 字段
- 为 `CampusExperience` 实体添加 `globalSort` 和 `localSort` 字段
- 为 `ProjectExperience` 实体添加 `globalSort` 和 `localSort` 字段
- 为 `InternshipExperience` 实体添加 `globalSort` 和 `localSort` 字段
- 更新 `update-resume.dto.ts` 中的 DTO 类，添加排序字段验证
- 更新 `create-resume.dto.ts` 中的 DTO 类，添加排序字段验证
- 在 `resume.service.ts` 中添加排序字段自动处理逻辑

## Impact
- Affected specs: 简历数据结构、简历创建/更新逻辑
- Affected code: 
  - `src/resume/entities/resume.entity.ts`
  - `src/resume/dto/update-resume.dto.ts`
  - `src/resume/dto/create-resume.dto.ts`
  - `src/resume/resume.service.ts`

## ADDED Requirements

### Requirement: 排序字段数据结构
系统 SHALL 为所有数组类型的简历数据项提供两个排序字段：
- `globalSort`: 全局排序字段，用于跨模块的整体排序
- `localSort`: 局部排序字段，用于当前数组内部的排序

#### Scenario: 排序字段默认值
- **WHEN** 创建新的数组项时未提供排序字段
- **THEN** 系统应自动生成合理的默认排序值

#### Scenario: 排序字段更新
- **WHEN** 用户更新简历数据时
- **THEN** 系统应正确保存排序字段值

### Requirement: 排序字段类型
排序字段 SHALL 使用数字类型（number），支持整数排序。

### Requirement: 向后兼容
系统 SHALL 保证现有数据的兼容性：
- 现有简历数据在读取时应能正常工作
- 缺少排序字段的旧数据应能正常显示和编辑

## MODIFIED Requirements

### Requirement: 简历实体数据结构
以下实体类需要新增排序字段：

**EducationBackground（教育背景）**
```typescript
@Prop({ default: 0 })
globalSort: number;

@Prop({ default: 0 })
localSort: number;
```

**WorkExperience（工作经验）**
```typescript
@Prop({ default: 0 })
globalSort: number;

@Prop({ default: 0 })
localSort: number;
```

**CampusExperience（校园经历）**
```typescript
@Prop({ default: 0 })
globalSort: number;

@Prop({ default: 0 })
localSort: number;
```

**ProjectExperience（项目经历）**
```typescript
@Prop({ default: 0 })
globalSort: number;

@Prop({ default: 0 })
localSort: number;
```

**InternshipExperience（实习经历）**
```typescript
@Prop({ default: 0 })
globalSort: number;

@Prop({ default: 0 })
localSort: number;
```

### Requirement: DTO 数据验证
更新相关的 DTO 类，添加排序字段的验证装饰器：
- 使用 `@IsNumber()` 验证字段类型
- 使用 `@IsOptional()` 标记为可选字段

## REMOVED Requirements
无移除的需求。
