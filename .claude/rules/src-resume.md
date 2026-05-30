---
paths: "src/resume/**"
description: "简历 CRUD 模块：简历的创建、查询、更新、删除和复制"
---

# 模块：src/resume

## 职责
提供简历的基础 CRUD 操作，包括创建、查询列表/详情、更新、删除、复制简历。所有入参通过 DTO + class-validator 校验。

## 文件列表
| 文件 | 职责 |
|------|------|
| `resume.module.ts` | 模块定义：注册 Resume 和 Template Schema，导入 ResumeAiModule |
| `resume.controller.ts` | 简历 REST API 端点 |
| `resume.service.ts` | 简历业务逻辑（CRUD + 复制） |
| `entities/resume.entity.ts` | 简历 Mongoose Schema |
| `dto/create-resume.dto.ts` | 创建简历 DTO |
| `dto/update-resume.dto.ts` | 更新简历 DTO |
| `dto/get-resume.dto.ts` | 查询简历 DTO |
| `dto/copy-resume.dto.ts` | 复制简历 DTO |
| `dto/download-resume.dto.ts` | 下载简历 DTO |

## 依赖关系
- **上游**：前端/客户端直接调用
- **下游**：`ResumeAiModule`（AI 相关功能）、`Template` Schema（模板关联）
- **外部**：无

## 常见修改点
- 新增简历字段：修改 `entities/resume.entity.ts` + 对应 DTO
- 新增查询条件：修改 `get-resume.dto.ts` + `resume.service.ts`
- 复制逻辑变更：修改 `resume.service.ts` 中的 copy 方法
