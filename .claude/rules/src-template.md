---
paths: "src/template/**"
description: "简历模板管理模块：模板的 CRUD 和关联"
---

# 模块：src/template

## 职责
管理简历模板，支持模板的创建、查询、更新、删除。模板与简历（Resume）和用户（User）关联。

## 文件列表
| 文件 | 职责 |
|------|------|
| `template.module.ts` | 模块定义：注册 Template/Resume/User 三个 Schema，导入 ResumeModule |
| `template.controller.ts` | 模板 REST API 端点 |
| `template.service.ts` | 模板业务逻辑 |
| `entities/template.entity.ts` | 模板 Mongoose Schema |

## 依赖关系
- **上游**：前端直接调用
- **下游**：`ResumeModule`（简历关联）、`User` Schema（用户关联）
- **外部**：无

## 常见修改点
- 新增模板字段：修改 `entities/template.entity.ts` + `template.service.ts`
- 模板关联逻辑变更：修改 `template.service.ts`
