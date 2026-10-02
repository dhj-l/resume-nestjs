# P0 安全与可用性修复 · 设计文档

> 日期：2026-10-02
> 依据：[2026-10-02-项目优化与缺失项分析报告.md](../2026-10-02-项目优化与缺失项分析报告.md) 第三章（P0）
> 约束：**不得影响正常用户使用**；全部按 TDD 修复；不引入新依赖；不改动已有数据。

## 1. 范围

| 编号 | 问题 | 本次范围 |
| --- | --- | --- |
| P0-1 | 构建产物在 `dist/src/main.js`，全部启动命令指向 `dist/main` | 修 `tsconfig.build.json` + 增加产物校验脚本 |
| P0-2 | `/admin/**` 10 个接口无角色校验 | 新增 `AdminGuard`（`ADMIN_EMAILS` 白名单） |
| P0-3 | `GET /user` 对所有登录用户开放；用户对象带出 OAuth 令牌 | 列表改 admin-only；返回用户统一脱敏 |
| P0-4 | `ThrottlerGuard` 未注册，限流与 6 处 `@Throttle` 全是死代码 | 注册 `APP_GUARD`；已登录按 userId 计数；阈值可配 |
| P0-5 | 登录可在验密前锁死任意账号；错误文案可枚举账号 | 去掉账号级硬锁定；统一文案；dummy compare；按邮箱+IP 计数 |
| P0-6 | 上传落盘扩展名取自 `originalname`，可写 `.html` → 同源 XSS | 扩展名由 MIME 白名单决定 + 魔数校验 + 失败删文件 |

不做（超出 P0）：角色字段持久化/RBAC、refresh token、优雅退出、索引优化、CI、迁移机制。

## 2. 关键决策

### 2.1 管理员身份：`ADMIN_EMAILS` 环境变量（已确认）
- 新增 `AdminGuard`，比对 `ConfigService.get('ADMIN_EMAILS')`（逗号分隔）与 `req.user.email`。
- 解析规则：按逗号切分、`trim`、转小写、去空、去重；缺失或为空 → **一律 403**（fail closed）。
- 不新增 `role` 字段、不做数据库迁移：改环境变量 + 重启即生效，可随时回滚。
- 现有 `req.user.role === 'admin'` 三处死代码改用同一判定函数，使「管理员可管理他人」真正可用。

### 2.2 用户对象脱敏（复用既有工具）
- 复用 `src/common/oauth/sanitize-user.util.ts` 的 `sanitizeOAuthUser()`：剥离 `password`、
  `oauthProviders[].accessToken/refreshToken/tokenExpiresAt`，**保留** `platform/platformUserId/nickname/avatarUrl/profileUrl`。
- 应用点：`findAll` / `findOne` / `login` / `update` / `updateProfile` / `remove`（`remove` 目前会把 bcrypt 哈希一起返回）。
- 保留前端「账号绑定」页所需字段，接口契约不删字段。

### 2.3 限流：按「已登录用户」计数，阈值可配
- 新增 `UserThrottlerGuard extends ThrottlerGuard`，`getTracker()` 优先用 `req.user.userId`，
  否则尝试验签 JWT 取 `userId`，再否则回退 `req.ip`。
  - 全局 guard 先于路由级 `JwtAuthGuard` 执行，此时 `req.user` 尚未填充，因此必须自行验签。
  - 好处：公司 NAT/同网段用户不再互相误伤；登录、OAuth、注册等未认证路由仍按 IP 限制（正确语义）。
- `ThrottlerModule.forRootAsync` 读 `THROTTLE_TTL_MS`（默认 60000）与 `THROTTLE_LIMIT`（默认 **120**，放宽以免前端自动保存打满）。
- 保留既有 6 处 `@Throttle`（登录/OAuth/面试/简历 AI 各 10 次/分钟）——启用它们即恢复 `docs/api/mock-interview.md` 已声明的行为。
- 新增 `TRUST_PROXY` 环境变量（默认 `false`）：当前生产是客户端直连 `:3000`，`req.ip` 即真实客户端；
  若将来全部走 nginx，必须置 `1`，否则所有用户共用一个代理 IP 会导致限流退化。

### 2.4 登录保护：永不锁死真实用户
- **移除账号级硬锁定**（原逻辑在验密前判断 `user.lockedUntil`，且 5 次失败即锁 30 分钟，任何陌生人可借此锁死他人）。
- 新增集合 `loginattempts`（`key = email|ipScope`，TTL 自清）：
  - `ipScope` 为「可信 IP」（非回环、非空）时：5 次失败 → 该 (邮箱, IP) 组合锁 15 分钟。
  - `ipScope` 为 `shared`（回环或缺失，说明未正确配置代理）时：**永不硬锁**，仅按失败次数加最多 2 秒延迟，并打一条 warn 日志提示配置 `TRUST_PROXY`。
  - 这样无论是否配置代理，都无法出现「一个攻击者锁死全体登录」或「锁死某个真实用户」。
- 文案统一：「邮箱或密码错误」用于「邮箱不存在」与「密码错误」；保留「该账户通过第三方平台注册，请使用第三方登录」（对 OAuth 用户是必要提示，已确认接受该取舍）。
- 邮箱不存在时执行一次 dummy `bcrypt.compare` 抹平时序。
- 登录成功：清空该邮箱的失败记录，并顺带清空历史遗留的 `loginAttempts` / `lockedUntil`（让当前被旧逻辑锁住的用户立刻恢复）。
- User schema 的 `loginAttempts` / `lockedUntil` 字段保留不动（不做数据迁移），仅停止写入。

### 2.5 上传：先保安全，再保兼容
- 落盘文件名 = 时间戳随机串 + **由声明 MIME 推导的扩展名**（不再取 `originalname`），因此永远不会写出 `.html/.js`。
- `fileFilter` 继续按声明 MIME 白名单快速拒绝。
- 落盘后读前 16 字节做**魔数校验**（PNG/JPEG/GIF/WEBP/PDF/ZIP(docx)/OLE2(doc)）；不一致 → 删除文件并 400。
- Word 两种容器互相容忍（浏览器对 `.doc` 的 MIME 推断常不准），避免误伤合法上传。
- 不引入新依赖（`file-type` 等），手写签名表。

## 3. 测试接缝（TDD 前置约定）

| 接缝 | 位置 | 覆盖 |
| --- | --- | --- |
| 构建产物校验 | `scripts/verify-build-entry.ts`（`pnpm verify:build`） | 从 `package.json` 的 `start:prod` 推导入口文件并断言其存在 |
| 真 HTTP e2e（主接缝） | `test/*.e2e-spec.ts`，启动真实 `AppModule` + 真实本机 MongoDB 的独立库 `ai-resume-e2e` | 越权 403、正常用户流程回归、限流 429、登录锁定行为、上传伪造被拒 |
| 单元 spec（纯逻辑） | 各源文件旁 `*.spec.ts` | `AdminGuard` 白名单解析、上传魔数/扩展名映射、登录失败计数与文案 |

两处**行为不变**的重构（否则 e2e 只能复制一份生产管线，测不出真问题）：
1. `main.ts` 的全局配置抽成 `src/bootstrap.ts` 的 `configureApp(app)`，`main.ts` 与 e2e 共用。
2. 修 `test/jest-e2e.json`（补 `moduleNameMapper`）并替换 Hello-World 骨架用例。

## 4. 安全阀

- e2e 只允许操作名字以 `-e2e` 结尾的数据库，`dropDatabase` 前做断言，绝不碰开发库。
- `ADMIN_EMAILS` 未配置 → 所有 `/admin/**` 一律 403（fail closed），不会因为漏配而放开。
- 上传 e2e 记录自己创建的文件并在 `afterAll` 删除，不污染 `uploads/`。
