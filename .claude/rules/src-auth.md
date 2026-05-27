---
paths: "src/auth/**"
description: "JWT 认证模块：Passport 策略 + Token 黑名单登出机制"
---

# 模块：src/auth

## 职责
提供 JWT 认证和授权能力：Passport JWT 策略验证请求 Token，Token 黑名单实现登出失效。不包含登录/注册逻辑（由 UserModule 负责）。

## 文件列表
| 文件 | 职责 |
|------|------|
| `auth.module.ts` | 模块定义：导入 PassportModule、注册 TokenBlacklist Schema |
| `strategies/jwt.strategy.ts` | JWT 验证策略：从请求中提取 Token，验证签名和有效期，检查黑名单 |
| `guards/jwt-auth.guard.ts` | JWT AuthGuard，用于保护需要登录的路由 |
| `token-blacklist.service.ts` | 黑名单服务：添加 Token、检查 Token 是否在黑名单中 |
| `entities/token-blacklist.entity.ts` | Token 黑名单 Mongoose Schema |

## 依赖关系
- **上游**：`UserModule`（通过 AuthGuard 保护路由/登出时添加黑名单）
- **下游**：无
- **外部**：无

## 常见修改点
- Token 过期时间调整：修改 `app.module.ts` 中 JwtModule 的 `expiresIn`
- 新增认证策略：在 `strategies/` 下添加，在 `auth.module.ts` 中注册
- 黑名单清理策略：修改 `token-blacklist.service.ts`
