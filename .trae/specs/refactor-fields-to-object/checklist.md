# Checklist

## 实体字段检查
- [x] Skills 嵌套 Schema 类已创建，包含 content 和 globalSort 字段
- [x] Certificates 嵌套 Schema 类已创建，包含 content 和 globalSort 字段
- [x] SelfEvaluation 嵌套 Schema 类已创建，包含 content 和 globalSort 字段
- [x] Resume 实体中 skills 字段已修改为 Skills 类型
- [x] Resume 实体中 certificates 字段已修改为 Certificates 类型
- [x] Resume 实体中 selfEvaluation 字段已修改为 SelfEvaluation 类型

## DTO 验证检查
- [x] update-resume.dto.ts 中 SkillsDto 已创建并使用 @ValidateNested() 装饰器
- [x] update-resume.dto.ts 中 CertificatesDto 已创建并使用 @ValidateNested() 装饰器
- [x] update-resume.dto.ts 中 SelfEvaluationDto 已创建并使用 @ValidateNested() 装饰器
- [x] create-resume.dto.ts 中 SkillsDto 已创建并使用 @ValidateNested() 装饰器
- [x] create-resume.dto.ts 中 CertificatesDto 已创建并使用 @ValidateNested() 装饰器
- [x] create-resume.dto.ts 中 SelfEvaluationDto 已创建并使用 @ValidateNested() 装饰器
- [x] 所有 DTO 类中的 globalSort 字段使用 @IsNumber() 和 @IsOptional() 装饰器
- [x] 所有 DTO 类中的 content 字段使用 @IsString() 和 @IsOptional() 装饰器

## AI Prompt 检查
- [x] resumeAiPrompt 中 skills 字段结构已更新为对象格式
- [x] resumeAiPrompt 中 certificates 字段结构已更新为对象格式
- [x] resumeAiPrompt 中 selfEvaluation 字段结构已更新为对象格式
- [x] ContentPromt 中 skills 字段结构已更新为对象格式
- [x] ContentPromt 中 certificates 字段结构已更新为对象格式
- [x] ContentPromt 中 selfEvaluation 字段结构已更新为对象格式
- [x] 排序字段规范说明已更新，包含新字段的默认 globalSort 值

## 业务逻辑检查
- [x] resume-ai.service.ts 中 AI 生成结果处理逻辑已更新
- [x] 创建简历时对象化字段能正确初始化
- [x] 更新简历时对象化字段能正确保存
- [x] 现有简历数据读取正常，向后兼容

## 代码质量检查
- [x] TypeScript 编译无错误
- [x] 代码风格符合项目规范
- [x] 无冗余代码
