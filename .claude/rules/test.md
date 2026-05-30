---
paths: "test/**"
description: "E2E 测试配置和测试用例，使用 Jest + supertest"
---

# 模块：test

## 职责
存放 E2E（端到端）测试文件和 Jest 配置。单元测试文件 (`*.spec.ts`) 位于 `src/` 下与被测文件同目录。

## 文件列表
| 文件 | 职责 |
|------|------|
| `jest-e2e.json` | E2E 测试的 Jest 配置（rootDir: `.`, testRegex: `.e2e-spec.ts$`） |
| `app.e2e-spec.ts` | 根路由 E2E 测试：验证 `GET /` 返回 200 和 "Hello World!" |

## 依赖关系
- **上游**：无（测试入口）
- **下游**：`src/`（导入 AppModule 进行集成测试）
- **外部**：无

## 常见修改点
- 新增 E2E 测试：在 `test/` 下创建 `*.e2e-spec.ts` 文件，使用 `supertest` 发起 HTTP 请求
- 新增单元测试：在 `src/` 下对应模块目录创建 `*.spec.ts` 文件
- 运行 E2E 测试前需确保 MongoDB 可用（E2E 测试使用真实 AppModule）
