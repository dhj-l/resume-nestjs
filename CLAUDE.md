# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 技术栈

- **框架**: NestJS 11 (Node.js, TypeScript 5.7, ESNext 模块系统)
- **数据库**: MongoDB (Mongoose 9 ODM)
- **认证**: JWT (Passport + @nestjs/jwt), Token 黑名单机制
- **AI**: DeepSeek API (LangChain 封装), 简历分析与优化
- **PDF 生成**: Puppeteer
- **文件上传**: Multer (支持图片/PDF/DOC/DOCX, 最大 10MB)
- **安全**: Helmet, 全局速率限制 (单 IP 每 60s 最多 30 次), CORS 白名单
- **包管理**: pnpm, 无 workspace

## 常用命令

```bash
# 开发运行
pnpm start:dev          # 启动开发服务器 (watch 模式)

# 构建 & 生产
pnpm build              # 编译 TypeScript → dist/
pnpm start:prod         # 生产模式运行 (node dist/main)

# 代码质量
pnpm lint               # ESLint + Prettier 自动修复
pnpm format             # Prettier 格式化

# 测试
pnpm test               # 运行单元测试 (Jest)
pnpm test:e2e           # 运行 E2E 测试
pnpm test:cov           # 测试覆盖率报告
```

## 项目架构

### 全局请求管线

```
请求 → Helmet → CORS → 全局异常过滤器 (AllExceptionsFilter)
    → 响应拦截器 (ResponseInterceptor) → 控制器
```

- **统一响应格式**: `{ code, message, data, timestamp, path }`
- **全局前缀**: `/api/v1`
- **健康检查**: `GET /api/v1/health` (含 MongoDB 连接状态)
- **静态资源**: `/uploads/` 映射到项目根 `uploads/` 目录

### 模块职责

| 模块 | 路径 | 职责 |
|------|------|------|
| `AppModule` | `src/app.module.ts` | 根模块：配置、数据库连接、全局拦截器/过滤器注册 |
| `UserModule` | `src/user/` | 用户 CRUD，依赖 AuthModule |
| `AuthModule` | `src/auth/` | JWT 验证策略 + Token 黑名单（登出失效） |
| `ResumeModule` | `src/resume/` | 简历 CRUD + DTO 校验，依赖 ResumeAiModule |
| `ResumeAiModule` | `src/resume-ai/` | AI 简历分析、优化、编辑记录、用量追踪，依赖 AiModule |
| `AiModule` | `src/ai/` | DeepSeek API 封装（LangChain），纯服务层 |
| `TemplateModule` | `src/template/` | 简历模板管理 |
| `UploadModule` | `src/common/upload/` | 文件上传（Multer 磁盘存储），依赖 ResumeAiModule |
| 通用设施 | `src/common/` | 全局异常过滤器、响应拦截器、工具函数 |

### 模块依赖关系图

```
AppModule
 ├── UserModule ──────→ AuthModule
 ├── ResumeModule ────→ ResumeAiModule ──→ AiModule
 ├── TemplateModule ──→ ResumeModule
 ├── UploadModule ────→ ResumeAiModule
 ├── AuthModule (JWT 策略 + 黑名单)
 └── AiModule (DeepSeek LangChain 封装)
```

### 关键设计约定

- **DTO 校验**: 所有入参使用 `class-validator` 装饰器，全局 `ValidationPipe` 启用 `whitelist: true`
- **环境变量**: 通过 `ConfigService` 读取，`.env.example` 记录所需变量（PORT, MONGODB_URI, JWT_SECRET, DEEPSEEK_API_KEY, CORS_ORIGINS）
- **AI 用量追踪**: `ResumeAiModule` 记录每次 AI 调用（`AiUsageRecord`），支持成本核算
- **Token 黑名单**: 用户登出时将 JWT 加入黑名单，`JwtStrategy` 验证时检查黑名单
- **文件上传**: Multer 磁盘存储到 `uploads/`，通过 `/uploads/` 路径静态访问

### 部署

项目支持多种部署方式：Vercel (vercel.json)、Railway (railway.json)、Docker (Dockerfile)。详见 `DEPLOYMENT.md`。
