---
paths: "src/user/**"
description: "用户管理模块：注册、登录、个人信息管理"
---

# 模块：src/user

## 职责
用户账户管理，包括注册、登录、获取个人信息、更新资料。依赖 AuthModule 的 TokenBlacklistService 实现登出功能。

## 文件列表
| 文件 | 职责 |
|------|------|
| `user.module.ts` | 模块定义：注册 User Schema，导入 AuthModule |
| `user.controller.ts` | 用户 REST API 端点（注册、登录、个人信息、登出） |
| `user.service.ts` | 用户业务逻辑：密码加密（bcrypt）、JWT 签发、Token 黑名单登出 |
| `entities/user.entity.ts` | 用户 Mongoose Schema |

## 依赖关系
- **上游**：前端直接调用
- **下游**：`AuthModule`（TokenBlacklistService 用于登出）
- **外部**：bcrypt（密码加密）

## 常见修改点
- 新增用户字段：修改 `entities/user.entity.ts` + `user.service.ts`
- 登录逻辑变更：修改 `user.service.ts` 中的认证方法
- 密码策略调整：修改 bcrypt 相关配置
