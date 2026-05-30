# Resume AI — 后台管理 API 接口文档

> **基准路径:** `http://<host>/api/v1`
> **统一响应格式:** `{ code, message, data, timestamp, path }`
> **认证方式:** `Authorization: Bearer <JWT_TOKEN>`（登录接口除外）

---

## 目录

1. [通用接口](#1-通用接口)
2. [管理员认证](#2-管理员认证)
3. [管理员 — 用户管理](#3-管理员--用户管理)
4. [管理员 — 简历管理](#4-管理员--简历管理)
5. [管理员 — AI 用量管理](#5-管理员--ai-用量管理)
6. [管理员 — 系统仪表盘](#6-管理员--系统仪表盘)

---

## 1. 通用接口

### 1.1 健康检查

```
GET /health
```

**认证:** 无需

**响应示例:**
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "status": "ok",
    "database": "connected",
    "timestamp": "2025-01-01T00:00:00.000Z",
    "uptime": 12345.67
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/health"
}
```

---

## 2. 管理员认证

### 2.1 管理员登录

```
POST /user/login
```

**认证:** 无需
**速率限制:** 60 秒内最多 5 次（防暴力破解）

**请求体:**
```json
{
  "email": "admin@example.com",
  "password": "Admin@123456"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | ✅ | 管理员邮箱 |
| password | string | ✅ | 密码 |

**响应示例:**
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "username": "admin",
      "email": "admin@example.com",
      "createdVia": "email",
      "oauthProviders": []
    }
  }
}
```

### 2.2 管理员登出

```
POST /user/logout
```

**认证:** ✅ JWT

**说明:** 将当前 Token 加入黑名单，使该 Token 立即失效。

**响应示例:**
```json
{
  "code": 200,
  "data": { "message": "退出登录成功" }
}
```

---

## 3. 管理员 — 用户管理

> ⚠️ 以下接口均需 JWT 认证。当角色系统完善后需添加 `AdminGuard` 限制仅管理员可访问。当前未做角色校验，持有有效 JWT 的用户均可访问。

### 3.1 查询用户列表

```
GET /user?page=1&pageSize=10&keyword=zhang&createdVia=email
```

**认证:** ✅ JWT

**查询参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 10 | 每页数量，最大 100 |
| keyword | string | — | 关键词搜索（模糊匹配用户名或邮箱） |
| createdVia | string | — | 注册来源筛选：`email` / `gitee` / `github` / `qq` |

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "username": "zhangsan",
        "email": "zhangsan@example.com",
        "loginAttempts": 0,
        "createdVia": "email",
        "oauthProviders": [],
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 10
  }
}
```

### 3.2 用户统计

```
GET /admin/users/stats
```

**认证:** ✅ JWT

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "totalUsers": 150,
    "newThisMonth": 23,
    "byPlatform": {
      "email": 80,
      "github": 35,
      "gitee": 25,
      "qq": 10
    }
  }
}
```

### 3.3 查看用户详情

```
GET /user/:id
```

**认证:** ✅ JWT

**说明:** 管理员可查看任意用户的详细信息。

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "loginAttempts": 0,
    "lockedUntil": null,
    "createdVia": "email",
    "oauthProviders": [],
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 3.4 更新用户信息

```
PATCH /user/:id
```

**认证:** ✅ JWT

**说明:** 管理员可更新任意用户的信息。

**请求体:**
```json
{
  "username": "zhangsan_new",
  "email": "newemail@example.com"
}
```

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | ❌ | 新用户名，3-20位 |
| email | string | ❌ | 新邮箱，格式合法 |

### 3.5 删除用户

```
DELETE /user/:id
```

**认证:** ✅ JWT

**说明:** 管理员可删除任意用户，会级联删除关联的简历、AI 记录等数据。

**响应示例:**
```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "zhangsan"
  }
}
```

---

## 4. 管理员 — 简历管理

> ⚠️ 以下接口均需 JWT 认证，且**不限 userId**，可跨用户操作。当前未做管理员角色校验。

### 4.1 查询所有简历列表

```
GET /admin/resumes?page=1&pageSize=10&keyword=前端&userId=xxx&isTemplate=false
```

**认证:** ✅ JWT

**查询参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 10 | 每页数量，最大 100 |
| keyword | string | — | 关键词搜索（匹配简历标题） |
| userId | string | — | 按用户 ID 筛选 |
| type | string | — | 按简历类型筛选 |
| isTemplate | boolean | — | 是否为模板简历 |

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "items": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "title": "前端开发工程师简历",
        "cover": "",
        "isTemplate": false,
        "type": "default",
        "createdAt": "2025-01-01T00:00:00.000Z",
        "updatedAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 200,
    "page": 1,
    "pageSize": 10
  }
}
```

### 4.2 简历统计

```
GET /admin/resumes/stats
```

**认证:** ✅ JWT

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "totalResumes": 500,
    "totalTemplates": 20,
    "totalNonTemplates": 480,
    "byType": {
      "default": 450,
      "creative": 30,
      "minimal": 20
    }
  }
}
```

### 4.3 查看任意简历详情

```
GET /admin/resumes/:id
```

**认证:** ✅ JWT

**说明:** 管理员可查看任意用户的简历完整数据（包含所有模块子文档）。

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439011",
    "title": "前端开发工程师简历",
    "type": "default",
    "cover": "",
    "isTemplate": false,
    "basicInfo": {
      "name": "张三",
      "gender": "男",
      "phone": "13800138000",
      "email": "zhangsan@example.com"
    },
    "jobIntention": {
      "jobIntention": "前端开发工程师",
      "intentionCity": "北京"
    },
    "educationBackground": [...],
    "workExperience": [...],
    "skills": { "content": "React, TypeScript" },
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### 4.4 删除任意简历

```
DELETE /admin/resumes/:id
```

**认证:** ✅ JWT

**说明:** 级联删除关联的 AI 生成记录、编辑记录、分析记录。

**响应示例:**
```json
{
  "code": 200,
  "message": "操作成功",
  "data": { "deleted": true }
}
```

---

## 5. 管理员 — AI 用量管理

> ⚠️ 以下接口均需 JWT 认证。当前未做管理员角色校验。

### 5.1 查询 AI 用量记录

```
GET /admin/ai-usage-records?page=1&pageSize=20&userId=xxx&aiFunction=resume_generation&success=true&startDate=2025-01-01&endDate=2025-01-31
```

**认证:** ✅ JWT

**查询参数:**

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| page | number | 1 | 页码 |
| pageSize | number | 10 | 每页数量 |
| userId | string | — | 按用户 ID 筛选（MongoDB ObjectId 格式） |
| aiFunction | string | — | AI 功能：`resume_generation` / `module_optimization` / `resume_analysis` / `smart_import` |
| success | boolean | — | 是否成功 |
| startDate | string | — | 开始日期 (ISO 8601) |
| endDate | string | — | 结束日期 (ISO 8601) |

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "list": [
      {
        "_id": "507f1f77bcf86cd799439011",
        "userId": "507f1f77bcf86cd799439011",
        "aiFunction": "resume_generation",
        "success": true,
        "duration": 3500,
        "resumeId": "507f1f77bcf86cd799439012",
        "metadata": {},
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "total": 1500,
    "page": 1,
    "pageSize": 20,
    "totalPages": 75
  }
}
```

### 5.2 查询单条 AI 用量记录

```
GET /admin/ai-usage-records/:id
```

**认证:** ✅ JWT

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "userId": "507f1f77bcf86cd799439011",
    "aiFunction": "resume_generation",
    "success": true,
    "duration": 3500,
    "resumeId": "507f1f77bcf86cd799439012",
    "metadata": {},
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### 5.3 删除 AI 用量记录

```
DELETE /admin/ai-usage-records/:id
```

**认证:** ✅ JWT

**响应示例:**
```json
{
  "code": 200,
  "message": "操作成功",
  "data": { "deleted": true }
}
```

### 5.4 AI 用量统计

```
GET /admin/ai-usage-records/stats
```

**认证:** ✅ JWT

**说明:** 返回全局 AI 调用统计数据，注意此路由必须放在 `:id` 路由之前。

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "totalCalls": 1500,
    "successRate": 0.92,
    "byFunction": {
      "resume_generation": { "total": 800, "success": 750 },
      "module_optimization": { "total": 400, "success": 380 },
      "resume_analysis": { "total": 200, "success": 170 },
      "smart_import": { "total": 100, "success": 80 }
    },
    "dailyUsage": [
      { "date": "2025-01-01", "count": 45 },
      { "date": "2025-01-02", "count": 52 }
    ],
    "topUsers": [
      { "userId": "507f1f77bcf86cd799439011", "count": 120 },
      { "userId": "507f1f77bcf86cd799439012", "count": 85 }
    ]
  }
}
```

---

## 6. 管理员 — 系统仪表盘

### 6.1 仪表盘概览

```
GET /admin/dashboard
```

**认证:** ✅ JWT

**说明:** 返回系统关键指标，适用于后台首页仪表盘展示。

**响应示例:**
```json
{
  "code": 200,
  "data": {
    "users": {
      "total": 150,
      "newThisMonth": 23
    },
    "resumes": {
      "total": 480,
      "templates": 20
    },
    "templates": {
      "total": 20
    },
    "aiCalls": {
      "total": 1500,
      "today": 35,
      "successRate": 0.92
    }
  }
}
```

---

## 附录 A: 统一错误响应

所有异常均通过全局异常过滤器处理，返回统一格式：

```json
{
  "code": 400,
  "message": "具体错误描述",
  "data": null,
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/some-path",
  "error": "Bad Request"
}
```

常见 HTTP 状态码:

| code | 说明 |
|------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 / Token 无效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突（如用户名已存在） |
| 429 | 请求过于频繁 |
| 500 | 服务器内部错误 |

## 附录 B: 认证说明

- **JWT Token:** 登录成功后返回，有效期 2 天
- **请求头:** `Authorization: Bearer <token>`
- **登出机制:** Token 写入黑名单集合，即时失效

## 附录 C: 后台管理端接口总览

| 接口 | 方法 | 所属模块 | 说明 |
|------|------|---------|------|
| `/health` | GET | 通用 | 健康检查 |
| `/user/login` | POST | 认证 | 管理员登录（邮箱+密码） |
| `/user/logout` | POST | 认证 | 管理员登出（Token 黑名单） |
| `/user` | GET | 用户管理 | 查询用户列表（分页+搜索+筛选） |
| `/user/:id` | GET | 用户管理 | 查看用户详情 |
| `/user/:id` | PATCH | 用户管理 | 更新用户信息 |
| `/user/:id` | DELETE | 用户管理 | 删除用户 |
| `/admin/users/stats` | GET | 用户管理 | 用户统计 |
| `/admin/resumes` | GET | 简历管理 | 查询所有简历（跨用户） |
| `/admin/resumes/stats` | GET | 简历管理 | 简历统计 |
| `/admin/resumes/:id` | GET | 简历管理 | 查看任意简历详情 |
| `/admin/resumes/:id` | DELETE | 简历管理 | 删除任意简历 |
| `/admin/ai-usage-records` | GET | AI 用量 | 查询 AI 用量记录 |
| `/admin/ai-usage-records/:id` | GET | AI 用量 | 查看单条 AI 用量记录 |
| `/admin/ai-usage-records/:id` | DELETE | AI 用量 | 删除 AI 用量记录 |
| `/admin/ai-usage-records/stats` | GET | AI 用量 | AI 用量统计 |
| `/admin/dashboard` | GET | 仪表盘 | 系统仪表盘概览 |

> ⚠️ 所有管理端接口当前仅做了 JWT 认证，尚未实现管理员角色鉴权。建议在角色系统完善后统一添加 `AdminGuard`。
