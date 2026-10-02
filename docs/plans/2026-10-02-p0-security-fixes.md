# P0 安全与可用性修复 · 实施计划

> **For the executing agent:** 按任务顺序执行，每个任务是一轮 red → green。设计见
> [2026-10-02-p0-security-fixes-design.md](./2026-10-02-p0-security-fixes-design.md)。

**Goal:** 修复分析报告中的 6 项 P0 问题，全程不破坏正常用户流程，并让每个修复都有可回归的测试。

**Architecture:** 以「真 HTTP e2e（真实 AppModule + 真实 Mongo 测试库）」为主接缝，纯逻辑用旁挂单元 spec 覆盖；`main.ts` 的全局配置抽成 `src/bootstrap.ts` 供生产与 e2e 共用。管理员身份来自 `ADMIN_EMAILS` 环境变量，不做数据库迁移。

**Tech Stack:** NestJS 11、Mongoose 9、Jest 30 + ts-jest、supertest、本机 MongoDB（`127.0.0.1:27017`）。

---

## 任务 0：设计文档与计划（本次提交）
- `git add docs/ && git commit -m "docs(p0): 补充 P0 修复设计文档与实施计划"`

---

## 任务 1：P0-1 构建产物路径（最简单，先跑通红→绿循环）

**Files:**
- Create: `scripts/verify-build-entry.ts`
- Modify: `tsconfig.build.json`、`package.json`（加 `verify:build` 脚本）

**Step 1：写检查脚本（先让它失败）**
`scripts/verify-build-entry.ts` 从 `package.json` 的 `start:prod` 里解析出入口 js 路径（如 `node dist/main` → `dist/main.js`），断言该文件存在，否则 `exit 1` 并打印修复提示。

**Step 2：跑一次，确认红**
```bash
pnpm build && npx ts-node --project tsconfig.scripts.json scripts/verify-build-entry.ts
```
Expected: FAIL（`dist/main.js` 不存在，产物在 `dist/src/main.js`）

**Step 3：修 `tsconfig.build.json`**
```json
{ "extends": "./tsconfig.json", "include": ["src/**/*.ts"], "exclude": ["node_modules","test","dist","**/*spec.ts"] }
```

**Step 4：跑一次，确认绿**
```bash
pnpm build && pnpm verify:build
```
Expected: PASS，且 `dist/main.js` 存在；`dist/scripts` 不再生成。

**Step 5：提交** `fix(build): 修正构建产物入口为 dist/main.js`

---

## 任务 2：e2e 基础设施

**Files:**
- Create: `src/bootstrap.ts`、`test/helpers/create-e2e-app.ts`、`test/setup-e2e.ts`、`test/app.e2e-spec.ts`（替换骨架）
- Modify: `src/main.ts`、`test/jest-e2e.json`、`package.json`

**Step 1：红** 新增 `test/health.e2e-spec.ts`：启动真实 AppModule → `GET /api/v1/health` 期望 200 且 `data.database === 'connected'`。
先跑：`pnpm test:e2e` → Expected: FAIL（模块解析错误 / 无全局前缀）

**Step 2：绿**
1. 把 `main.ts` 中的 helmet/CORS/静态目录/全局前缀/ValidationPipe 抽到 `src/bootstrap.ts` 的 `configureApp(app)`，`main.ts` 改为调用它（行为不变）。
2. `test/jest-e2e.json` 补 `moduleNameMapper: {"^src/(.*)$": "<rootDir>/../src/$1"}`、`setupFiles: ["<rootDir>/setup-e2e.ts"]`、`maxWorkers: 1`。
3. `test/setup-e2e.ts`：把 `MONGODB_URI` 指向 `ai-resume-e2e`（独立库）、设 `NODE_ENV=test`。
4. `test/helpers/create-e2e-app.ts`：建测试模块 → `configureApp` → `app.init()`；提供 `dropTestDb()`（**断言库名以 `-e2e` 结尾**才允许 drop）。

**Step 3：确认绿** `pnpm test:e2e`，并 `pnpm test`（单测不受影响）

**Step 4：提交** `test(e2e): 修复 e2e 配置并加入真实 AppModule 冒烟用例`

---

## 任务 3：P0-2 管理员鉴权（AdminGuard）

**Files:**
- Create: `src/auth/guards/admin.guard.ts`、`src/auth/guards/admin.guard.spec.ts`、`test/admin-authz.e2e-spec.ts`
- Modify: `src/admin/admin.controller.ts`、`src/resume/admin-resume.controller.ts`、`src/user/admin-users.controller.ts`、`src/resume-ai/ai-usage-record.controller.ts`

**Step 1：红（单元）** `admin.guard.spec.ts`：`ADMIN_EMAILS=" a@x.com, B@X.com ,"` 时 `a@x.com`/`b@x.com` 通过、`c@x.com` 抛 ForbiddenException、未配置时**任何人都 403**、`req.user` 缺失时 403。
**Step 2：红（e2e）** `test/admin-authz.e2e-spec.ts`：普通用户 token 访问 `GET /api/v1/admin/resumes`、`GET /api/v1/admin/dashboard`、`GET /api/v1/admin/ai-usage-records`、`GET /api/v1/admin/users/stats` 全部 403；`ADMIN_EMAILS` 里的账号访问同一批接口 200。
**Step 3：绿** 实现 `AdminGuard`（`parseAdminEmails()` 纯函数 + guard），4 个控制器改 `@UseGuards(JwtAuthGuard, AdminGuard)`。
**Step 4：确认绿** `pnpm test admin.guard && pnpm test:e2e`
**Step 5：提交** `fix(auth): 新增 AdminGuard 并为管理端接口加上角色校验`

---

## 任务 4：P0-3 用户数据脱敏 + 列表接口改 admin-only

**Files:**
- Modify: `src/user/user.service.ts`（`findAll`/`findOne`/`login`/`update`/`updateProfile`/`remove` 统一脱敏）、`src/user/user.controller.ts`（列表加 `AdminGuard`，三处 `role === 'admin'` 改用 `isAdminEmail`）、`src/user/user.service.spec.ts`
- Create: `test/user-privacy.e2e-spec.ts`

**Step 1：红（单元）** `user.service.spec.ts` 新增：`findAll`/`findOne`/`remove`/`login` 的返回值**不含** `password`、`oauthProviders[].accessToken/refreshToken/tokenExpiresAt`，但**保留** `platform/nickname/avatarUrl`。
**Step 2：红（e2e）** 普通用户 `GET /api/v1/user` → 403；`GET /api/v1/user/profile` → 200 且响应体不含 `accessToken`/`password`；`GET /api/v1/user/:自己id` → 200；`GET /api/v1/user/:他人id` → 403。
**Step 3：绿** 落地脱敏与鉴权（复用 `sanitizeOAuthUser`）。
**Step 4：确认绿** `pnpm test user.service && pnpm test:e2e`
**Step 5：提交** `fix(user): 用户对象统一脱敏并将用户列表收紧为管理员专属`

---

## 任务 5：P0-4 限流真正生效

**Files:**
- Create: `src/common/guards/user-throttler.guard.ts`、`src/common/guards/user-throttler.guard.spec.ts`、`test/rate-limit.e2e-spec.ts`
- Modify: `src/app.module.ts`（`forRootAsync` + `APP_GUARD`）、`src/bootstrap.ts`（`TRUST_PROXY`）、`.env.example`

**Step 1：红（单元）** guard 的 `getTracker()`：有 `req.user.userId` → `user:<id>`；无 user 但带合法 Bearer → `user:<id>`；非法/缺失 token → `ip:<ip>`。
**Step 2：红（e2e）** 用 `THROTTLE_LIMIT=3, THROTTLE_TTL_MS=60000` 启动 AppModule：同一用户第 4 次请求 429；不同用户各自计数不受影响。
**Step 3：绿** 实现 guard + `forRootAsync` 读 `THROTTLE_TTL_MS`/`THROTTLE_LIMIT`（默认 60000/**120**）+ 注册 `APP_GUARD`。
**Step 4：确认绿** `pnpm test && pnpm test:e2e`
**Step 5：提交** `fix(throttle): 注册全局限流守卫并按登录用户计数`

---

## 任务 6：P0-5 登录不再可被锁死

**Files:**
- Create: `src/user/entities/login-attempt.entity.ts`、`src/user/login-attempt.service.ts`、`src/user/login-attempt.service.spec.ts`、`test/login-lockout.e2e-spec.ts`
- Modify: `src/user/user.service.ts`（`login(dto, clientIp?)`）、`src/user/user.controller.ts`（传 `req.ip`）、`src/user/user.module.ts`（注册模型）、`src/user/user.service.spec.ts`

**Step 1：红（单元）** `user.service.spec.ts`：邮箱不存在与密码错误返回**同一**文案；邮箱不存在时调用 dummy compare；5 次失败后**可信 IP** 被锁而**另一 IP 仍可登录**；**回环 IP 永不硬锁**；登录成功清空失败记录并复位 `loginAttempts/lockedUntil`；OAuth-only 账号保留提示文案。
**Step 2：红（e2e）** `test/login-lockout.e2e-spec.ts`（`TRUST_PROXY=1` + `X-Forwarded-For`）：A 攻击者连续 5 次错误后，A 的 IP 被拒（429/400 带锁定文案），B 的 IP 用**正确密码**仍能登录成功（这是「不影响正常用户」的核心断言）。
**Step 3：绿** 实现 `LoginAttemptService` 与新的 `login()`。
**Step 4：确认绿** `pnpm test && pnpm test:e2e`
**Step 5：提交** `fix(auth): 登录不再可被用于锁定他人账号，并统一失败文案`

---

## 任务 7：P0-6 上传安全

**Files:**
- Create: `src/common/upload/upload-validation.ts`、`src/common/upload/upload-validation.spec.ts`、`test/upload-security.e2e-spec.ts`
- Modify: `src/common/upload/upload.module.ts`、`src/common/upload/upload.controller.ts`

**Step 1：红（单元）**：`extensionForMime()` 对 7 种白名单 MIME 返回正确扩展名、未知 MIME 抛错；`sniffMime()` 识别 PNG/JPEG/GIF/WEBP/PDF/ZIP/OLE2、垃圾字节返回 `null`；`assertContentMatchesMime()` 对「声明 image/png 实为 HTML」抛 BadRequestException。
**Step 2：红（e2e）**：真实 1×1 PNG 上传 → 200 且 URL 以 `.png` 结尾；HTML 内容伪装 `image/png` → 400 且磁盘无残留；文件名 `x.html` + `text/html` → 400。
**Step 3：绿** 实现校验模块并接线（落盘用安全扩展名，落盘后校验、失败 unlink）。
**Step 4：确认绿** `pnpm test && pnpm test:e2e`；确认 `uploads/` 无测试残留。
**Step 5：提交** `fix(upload): 上传扩展名改由 MIME 决定并校验文件魔数`

---

## 任务 8：全量验证与文档

- `pnpm lint && pnpm test && pnpm test:e2e && pnpm build && pnpm verify:build` 全绿
- 新增 `test/user-flow-regression.e2e-spec.ts`：注册 → 登录 → 建简历 → 列表 → 详情 → 更新 → 复制 → 删除 → 获取 profile → 上传图片 的完整正常流程全部 2xx（证明「不影响正常用户」）
- 更新 `.env.example`（`ADMIN_EMAILS` / `TRUST_PROXY` / `THROTTLE_TTL_MS` / `THROTTLE_LIMIT` / `CORS_ORIGINS` / `LOG_LEVEL`）、`DEPLOYMENT.md`、`CLAUDE.md`
- 提交 `docs: 补充 P0 修复相关环境变量与部署说明`
