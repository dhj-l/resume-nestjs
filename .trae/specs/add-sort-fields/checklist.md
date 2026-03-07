# Checklist

## 实体字段检查
- [x] EducationBackground 实体包含 globalSort 和 localSort 字段
- [x] WorkExperience 实体包含 globalSort 和 localSort 字段
- [x] CampusExperience 实体包含 globalSort 和 localSort 字段
- [x] ProjectExperience 实体包含 globalSort 和 localSort 字段
- [x] InternshipExperience 实体包含 globalSort 和 localSort 字段

## DTO 验证检查
- [x] update-resume.dto.ts 中所有数组类型 DTO 包含排序字段验证
- [x] create-resume.dto.ts 中所有数组类型 DTO 包含排序字段验证
- [x] 排序字段使用 @IsNumber() 装饰器
- [x] 排序字段使用 @IsOptional() 装饰器

## 业务逻辑检查
- [x] 创建简历时排序字段能正确初始化
- [x] 更新简历时排序字段能正确保存
- [x] 现有简历数据读取正常，向后兼容

## 代码质量检查
- [x] TypeScript 编译无错误
- [x] 代码风格符合项目规范
- [x] 无冗余代码
