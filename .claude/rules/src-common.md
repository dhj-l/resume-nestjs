---
paths: "src/common/**"
description: "通用基础设施：全局异常过滤器、响应拦截器、文件上传、工具函数"
---

# 模块：src/common

## 职责
提供 NestJS 应用的通用基础设施，包括全局异常过滤器（统一错误格式）、响应拦截器（统一成功格式）、文件上传模块、工具函数。这些组件在 `app.module.ts` 中全局注册或按需导入。

## 文件列表
| 文件 | 职责 |
|------|------|
| `filters/all-exceptions.filter.ts` | 全局异常过滤器：捕获所有异常，统一输出 `{ code, message, data, timestamp, path }` |
| `filters/http-exception.filter.ts` | HTTP 异常过滤器（特定处理） |
| `filters/unauthorized-exception.filter.ts` | 未授权异常过滤器 |
| `interceptors/response.interceptor.ts` | 全局响应拦截器：包装成功响应为 `{ code: 200, message: "操作成功", data, timestamp, path }`，支持透传已格式化响应 |
| `upload/upload.module.ts` | 文件上传模块：Multer 配置（磁盘存储、文件类型白名单、10MB 限制） |
| `upload/upload.controller.ts` | 文件上传端点 |
| `upload/upload.service.ts` | 文件上传服务逻辑 |
| `utils/date.ts` | 日期工具函数 |
| `utils/token.ts` | Token 工具函数 |

## 依赖关系
- **上游**：`AppModule`（全局注册过滤器/拦截器）、`ResumeAiModule`（UploadModule 依赖）
- **下游**：无
- **外部**：Multer（文件处理）

## 常见修改点
- 调整响应格式：修改 `response.interceptor.ts`
- 调整错误处理逻辑：修改 `all-exceptions.filter.ts`
- 文件上传限制调整：修改 `upload.module.ts`（文件类型、大小限制）
- 新增工具函数：在 `utils/` 下添加
