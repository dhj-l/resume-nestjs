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

## 编码规范与约束

### 包管理器

- **pnpm**，禁止使用 npm 或 yarn

### 测试框架

- **Jest + ts-jest**，配合 `@nestjs/testing` 的 `Test.createTestingModule` 构建测试模块
- 单元测试文件命名：`*.spec.ts`，位于 `src/` 下与被测文件同目录
- E2E 测试文件命名：`*.e2e-spec.ts`，位于 `test/` 目录
- Mock 模式：手动构造 mock 对象，通过 `useValue` 注入 providers

### 测试命令

| 命令 | 用途 |
|------|------|
| `pnpm test` | 运行单元测试 |
| `pnpm test:e2e` | 运行 E2E 测试 |
| `pnpm test:cov` | 运行测试并输出覆盖率 |
| `pnpm test:watch` | watch 模式运行 |

### 代码风格

| 规则 | 配置 |
|------|------|
| 引号 | 单引号（Prettier `singleQuote: true`） |
| 分号 | 保留分号（Prettier 默认） |
| 缩进 | 2 个空格（Prettier 默认） |
| 尾逗号 | 全部添加（Prettier `trailingComma: "all"`） |
| 行尾符 | `auto`（ESLint `endOfLine: 'auto'`） |
| 编译目标 | ES2023，NodeNext ESM 模块 |
| 类型严格性 | `strictNullChecks: true`，`noImplicitAny: false` |

### 架构硬性约束

1. **外部 API 封装** — 所有外部 AI API 调用必须通过 `AiModule`（`src/ai/`）封装，其他模块禁止直接调用外部 AI 服务。当前使用 DeepSeek + LangChain。

2. **统一响应格式不可绕过** — 全局 `ResponseInterceptor` 将所有成功响应包装为 `{ code, message, data, timestamp, path }`；`AllExceptionsFilter` 统一所有异常为相同格式。控制器不应自行构造响应结构。

3. **环境变量统一入口** — `ConfigModule.forRoot({ isGlobal: true })`，所有配置通过 `ConfigService` 读取，禁止直接使用 `process.env`。

4. **Token 黑名单登出** — 用户登出时 Token 写入黑名单集合（`TokenBlacklist`），`JwtStrategy` 验证时检查黑名单，而非依赖 Token 自然过期。

5. **文件上传为磁盘存储** — Multer 直接写入项目根 `uploads/` 目录，通过 `/uploads/` 路径静态托管。生产环境需注意无服务器平台（如 Vercel）不支持持久化文件存储。
