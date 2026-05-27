---
paths: "src/app.*|src/main.ts"
description: "NestJS 应用入口和根模块：全局配置、数据库连接、请求管线"
---

# 模块：src（入口文件）

## 职责
应用的启动入口和根模块，负责全局配置（ConfigModule、MongoDB、JWT、Throttler）、全局拦截器/过滤器注册、请求管线设置。

## 文件列表
| 文件 | 职责 |
|------|------|
| `main.ts` | 应用入口：Helmet、CORS 白名单、ValidationPipe、静态资源 `/uploads/`、全局前缀 `/api/v1` |
| `app.module.ts` | 根模块：ConfigModule（全局）、MongoDB 连接、JWT 注册（全局）、Throttler、所有业务模块导入、全局 ResponseInterceptor 和 AllExceptionsFilter 注册 |
| `app.controller.ts` | 根路由 `GET /` + 健康检查 `GET /health`（含 MongoDB 连接状态和进程 uptime） |
| `app.service.ts` | 根服务（仅 `getHello()`） |

## 依赖关系
- **上游**：无
- **下游**：所有业务模块（User、Resume、ResumeAi、Ai、Template、Auth、Upload）
- **外部**：MongoDB（Mongoose）、ConfigService（环境变量）

## 常见修改点
- 新增模块：在 `app.module.ts` 的 `imports` 中注册
- CORS 白名单变更：修改 `main.ts` 中 `CORS_ORIGINS` 解析逻辑
- 全局管线调整：修改 `main.ts`（如添加新中间件）或 `app.module.ts`（如更换全局过滤器）
- 新增环境变量：在 `.env.example` 中记录，通过 `ConfigService` 读取
