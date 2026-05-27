# 新增 API 接口文档

> **分支**: `fix/hardcoded-to-env-config`  
> **基准分支**: `main` (merge-base: `ef74167`)  
> **统计**: 共新增 **12 个接口**，分布在 4 个模块，其中 10 个需要 JWT 认证，2 个无需认证。

---

## 目录

- [前置说明](#前置说明)
- [模块一：Gitee OAuth 认证](#模块一gitee-oauth-认证)
  - [1. 获取 Gitee 授权 URL](#1-获取-gitee-授权-url)
  - [2. Gitee OAuth 回调](#2-gitee-oauth-回调)
- [模块二：简历 AI 分析](#模块二简历-ai-分析)
  - [3. AI 分析简历](#3-ai-分析简历)
  - [4. 获取分析记录列表](#4-获取分析记录列表)
  - [5. 获取分析详情](#5-获取分析详情)
  - [6. 获取最近一次分析](#6-获取最近一次分析)
  - [7. 获取 AI 使用记录](#7-获取-ai-使用记录)
  - [8. 获取 AI 使用统计](#8-获取-ai-使用统计)
- [模块三：管理员 AI 使用记录管理](#模块三管理员-ai-使用记录管理)
  - [9. 查询 AI 使用记录列表](#9-查询-ai-使用记录列表)
  - [10. 获取单条 AI 使用记录](#10-获取单条-ai-使用记录)
  - [11. 删除 AI 使用记录](#11-删除-ai-使用记录)
- [模块四：用户登出](#模块四用户登出)
  - [12. 用户登出](#12-用户登出)
- [汇总表](#汇总表)

---

## 前置说明

### 基础信息

| 项目 | 说明 |
|------|------|
| 全局前缀 | `/api/v1` |
| 认证方式 | JWT Bearer Token（`Authorization: Bearer <token>`） |
| 统一响应格式 | `{ code, message, data, timestamp, path }` |
| Content-Type | `application/json`（除特殊说明外） |

### 获取 JWT Token

在调用需要认证的接口之前，需要先通过登录接口获取 Token：

```bash
curl -X POST http://localhost:3000/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{"username": "your_username", "password": "your_password"}'
```

响应示例：

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": { "_id": "...", "username": "...", "email": "..." }
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/user/login"
}
```

后续所有需要认证的请求，在请求头中携带：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIs...
```

---

## 模块一：Gitee OAuth 认证

### 1. 获取 Gitee 授权 URL

发起 Gitee OAuth 授权流程的第一步，获取 Gitee 授权页面的 URL。前端拿到 URL 后，将用户重定向到 Gitee 进行授权。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/auth/gitee` |
| **认证** | ❌ 不需要 |
| **速率限制** | 无 |

#### 调用步骤

1. 前端调用此接口获取授权 URL
2. 将用户浏览器重定向到返回的 `authUrl`
3. 用户在 Gitee 页面完成授权
4. Gitee 自动重定向到回调地址（接口 2）

#### 请求示例

```bash
curl -X GET http://localhost:3000/api/v1/auth/gitee
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "authUrl": "https://gitee.com/oauth/authorize?client_id=xxx&redirect_uri=xxx&response_type=code&state=abc123",
    "state": "abc123"
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/auth/gitee"
}
```

#### 前端使用示例

```javascript
const res = await fetch('/api/v1/auth/gitee');
const { data } = await res.json();
// 跳转到 Gitee 授权页面
window.location.href = data.authUrl;
```

---

### 2. Gitee OAuth 回调

Gitee 授权成功后，Gitee 会将用户重定向到此回调地址，并携带授权码 `code` 和防 CSRF 参数 `state`。服务端验证后返回 JWT Token。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/auth/gitee/callback` |
| **认证** | ❌ 不需要 |
| **速率限制** | 60 秒内最多 10 次 |

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | ✅ | Gitee 颁发的授权码（一次性，有效期极短） |
| `state` | string | ✅ | 授权发起时生成的防 CSRF 参数 |

#### 调用步骤

1. 用户在 Gitee 完成授权后，Gitee 自动携带 `code` 和 `state` 重定向到此接口
2. 服务端校验 `state` 有效性（防 CSRF）
3. 使用 `code` 向 Gitee 换取 `access_token`
4. 通过 `access_token` 获取 Gitee 用户信息
5. 查找或创建本地用户 → 签发 JWT Token
6. 前端收到 Token 后存储并跳转到应用主页

#### 请求示例

> ⚠️ 此接口通常由 Gitee 重定向自动调用，无需手动请求。以下仅为测试示例：

```bash
curl -X GET "http://localhost:3000/api/v1/auth/gitee/callback?code=your_auth_code&state=abc123"
```

#### 响应示例（成功）

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "user": {
      "_id": "64a1b2c3d4e5f6a7b8c9d0e1",
      "username": "gitee_user",
      "email": "user@example.com",
      "oauthProviders": {
        "gitee": {
          "openId": "12345",
          "accessToken": "encrypted_token"
        }
      }
    }
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/auth/gitee/callback"
}
```

#### 错误场景

| HTTP 状态码 | 错误信息 | 原因 |
|-------------|----------|------|
| 400 | `state 参数无效或已过期` | state 校验失败，可能是 CSRF 攻击或 state 已过期 |
| 400 | `授权码无效或已过期` | code 已被使用或已过期 |
| 400 | `获取 Gitee 用户信息失败` | Gitee API 调用异常 |

---

## 模块二：简历 AI 分析

> ⚠️ **所有接口均需要 JWT 认证**（控制器级别 `@UseGuards(JwtAuthGuard)`）

### 3. AI 分析简历

提交简历 ID 和目标岗位 JD，调用 AI 分析简历与岗位的匹配度。

| 属性 | 值 |
|------|-----|
| **路径** | `POST /api/v1/resume-ai/analyze` |
| **认证** | ✅ JWT |
| **超时** | LLM 调用超时 120 秒 |

#### 请求参数（Body）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `resumeId` | string | ✅ | 简历 ID |
| `jobDescription` | string | ✅ | 目标岗位 JD（职位描述） |

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 准备一份简历（通过简历管理接口创建/上传），记录其 `resumeId`
3. 准备目标岗位的 JD 文本
4. 调用此接口提交分析请求
5. 服务端校验 JD 长度 → 检查是否有进行中的分析任务 → 查询简历 → 创建分析记录（状态 `analyzing`）→ 调用 LLM → 保存结果 → 记录 AI 用量
6. 轮询或等待结果返回

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/v1/resume-ai/analyze \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{
    "resumeId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "jobDescription": "我们正在寻找一位拥有5年以上经验的前端开发工程师，精通React、TypeScript和Node.js..."
  }'
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "recordId": "64b2c3d4e5f6a7b8c9d0e1f2",
    "analysisResult": {
      "matchScore": 85,
      "strengths": ["技术栈匹配度高", "项目经验丰富"],
      "weaknesses": ["缺少团队管理经验"],
      "suggestions": ["建议补充团队协作相关描述"],
      "detailAnalysis": "..."
    }
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/resume-ai/analyze"
}
```

---

### 4. 获取分析记录列表

分页查询当前用户的简历分析记录。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/resume-ai/analysis-records` |
| **认证** | ✅ JWT |

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | number | ❌ | 1 | 页码（最小 1） |
| `pageSize` | number | ❌ | 10 | 每页条数（最大 100） |

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 直接调用接口获取分析记录列表
3. 可通过 `page` 和 `pageSize` 控制分页

#### 请求示例

```bash
curl -X GET "http://localhost:3000/api/v1/resume-ai/analysis-records?page=1&pageSize=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
        "resumeId": "64a1b2c3d4e5f6a7b8c9d0e1",
        "jobDescription": "我们正在寻找...",
        "status": "completed",
        "analysisResult": { "matchScore": 85 },
        "userId": "64a1b2c3d4e5f6a7b8c9d0e1",
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 25,
    "page": 1,
    "pageSize": 10,
    "totalPages": 3
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/resume-ai/analysis-records"
}
```

---

### 5. 获取分析详情

根据分析记录 ID 获取单条分析记录的详细信息。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/resume-ai/analysis-detail` |
| **认证** | ✅ JWT |

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string (MongoId) | ✅ | 分析记录 ID |

#### 调用步骤

1. 从"分析记录列表"中获取目标记录的 `_id`
2. 调用此接口获取详细分析结果

#### 请求示例

```bash
curl -X GET "http://localhost:3000/api/v1/resume-ai/analysis-detail?id=64b2c3d4e5f6a7b8c9d0e1f2" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
    "resumeId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "jobDescription": "我们正在寻找...",
    "status": "completed",
    "analysisResult": {
      "matchScore": 85,
      "strengths": ["技术栈匹配度高"],
      "weaknesses": ["缺少团队管理经验"],
      "suggestions": ["建议补充团队协作相关描述"],
      "detailAnalysis": "..."
    },
    "userId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "createdAt": "2025-01-01T00:00:00.000Z",
    "updatedAt": "2025-01-01T00:01:00.000Z"
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/resume-ai/analysis-detail"
}
```

---

### 6. 获取最近一次分析

查询指定简历最近一次的 AI 分析结果。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/resume-ai/latest-analysis` |
| **认证** | ✅ JWT |

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `resumeId` | string | ✅ | 简历 ID |

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 传入目标简历 ID 即可获取该简历最近一次分析结果

#### 请求示例

```bash
curl -X GET "http://localhost:3000/api/v1/resume-ai/latest-analysis?resumeId=64a1b2c3d4e5f6a7b8c9d0e1" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "_id": "64b2c3d4e5f6a7b8c9d0e1f2",
    "resumeId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "status": "completed",
    "analysisResult": { "matchScore": 85 },
    "createdAt": "2025-01-01T00:00:00.000Z"
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/resume-ai/latest-analysis"
}
```

> 如果该简历没有任何分析记录，`data` 为 `null`。

---

### 7. 获取 AI 使用记录

分页查询当前用户的 AI 调用使用记录。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/resume-ai/usage-records` |
| **认证** | ✅ JWT |

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `page` | number | ❌ | 1 | 页码（最小 1） |
| `pageSize` | number | ❌ | 10 | 每页条数（最大 100） |
| `aiFunction` | string | ❌ | — | AI 功能类型筛选 |

`aiFunction` 可选值：

| 值 | 说明 |
|----|------|
| `resume_generation` | AI 简历生成 |
| `module_optimization` | AI 模块优化 |
| `resume_analysis` | AI 简历分析 |
| `smart_import` | AI 智能导入简历 |

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 直接调用获取使用记录列表
3. 可选：通过 `aiFunction` 筛选特定功能类型

#### 请求示例

```bash
# 查询所有使用记录
curl -X GET "http://localhost:3000/api/v1/resume-ai/usage-records?page=1&pageSize=10" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 按功能类型筛选
curl -X GET "http://localhost:3000/api/v1/resume-ai/usage-records?aiFunction=resume_analysis" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "_id": "64c3d4e5f6a7b8c9d0e1f2a3",
        "userId": "64a1b2c3d4e5f6a7b8c9d0e1",
        "aiFunction": "resume_analysis",
        "success": true,
        "duration": 3500,
        "createdAt": "2025-01-01T00:00:00.000Z"
      }
    ],
    "total": 100,
    "page": 1,
    "pageSize": 10,
    "totalPages": 10
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/resume-ai/usage-records"
}
```

---

### 8. 获取 AI 使用统计

获取当前用户的 AI 使用统计数据，包含总体统计、按功能分组统计、近 30 天趋势。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/resume-ai/usage-stats` |
| **认证** | ✅ JWT |

#### 请求参数

无（用户 ID 从 JWT Token 中提取）。

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 直接调用获取统计数据

#### 请求示例

```bash
curl -X GET http://localhost:3000/api/v1/resume-ai/usage-stats \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "totalCalls": 150,
    "successCalls": 145,
    "avgDuration": 3200,
    "byFunction": [
      { "function": "resume_generation", "count": 50 },
      { "function": "resume_analysis", "count": 60 },
      { "function": "module_optimization", "count": 30 },
      { "function": "smart_import", "count": 10 }
    ],
    "last30Days": [
      { "date": "2025-01-01", "count": 5 },
      { "date": "2025-01-02", "count": 8 }
    ]
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/resume-ai/usage-stats"
}
```

---

## 模块三：管理员 AI 使用记录管理

> ⚠️ **所有接口均需要 JWT 认证**。  
> 📝 当前仅做了 JWT 认证，未来将添加 `AdminGuard` 限制仅管理员可访问。

### 9. 查询 AI 使用记录列表

管理员查询所有用户的 AI 使用记录，支持多维度筛选。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/admin/ai-usage-records` |
| **认证** | ✅ JWT |

#### 请求参数（Query）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | number | ❌ | 页码 |
| `pageSize` | number | ❌ | 每页条数 |
| `userId` | string (MongoId) | ❌ | 按用户 ID 筛选 |
| `aiFunction` | enum | ❌ | 按 AI 功能类型筛选：`resume_generation` / `module_optimization` / `resume_analysis` / `smart_import` |
| `success` | boolean | ❌ | 按调用是否成功筛选 |
| `startDate` | string | ❌ | 开始日期 |
| `endDate` | string | ❌ | 结束日期 |

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 根据需要组合筛选条件进行查询

#### 请求示例

```bash
# 查询所有记录
curl -X GET "http://localhost:3000/api/v1/admin/ai-usage-records?page=1&pageSize=20" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 按用户和功能筛选
curl -X GET "http://localhost:3000/api/v1/admin/ai-usage-records?userId=64a1b2c3d4e5f6a7b8c9d0e1&aiFunction=resume_analysis" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."

# 按日期范围筛选
curl -X GET "http://localhost:3000/api/v1/admin/ai-usage-records?startDate=2025-01-01&endDate=2025-01-31" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "list": [
      {
        "_id": "64c3d4e5f6a7b8c9d0e1f2a3",
        "userId": "64a1b2c3d4e5f6a7b8c9d0e1",
        "aiFunction": "resume_analysis",
        "success": true,
        "duration": 3500,
        "modelName": "deepseek-chat",
        "tokenUsage": { "input": 500, "output": 800 },
        "createdAt": "2025-01-15T10:30:00.000Z"
      }
    ],
    "total": 500,
    "page": 1,
    "pageSize": 20,
    "totalPages": 25
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/admin/ai-usage-records"
}
```

---

### 10. 获取单条 AI 使用记录

根据记录 ID 获取单条 AI 使用记录的详细信息。

| 属性 | 值 |
|------|-----|
| **路径** | `GET /api/v1/admin/ai-usage-records/:id` |
| **认证** | ✅ JWT |

#### 请求参数（Path）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string (MongoId) | ✅ | AI 使用记录 ID |

#### 调用步骤

1. 从记录列表中获取目标记录的 `_id`
2. 调用此接口获取详情

#### 请求示例

```bash
curl -X GET http://localhost:3000/api/v1/admin/ai-usage-records/64c3d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "_id": "64c3d4e5f6a7b8c9d0e1f2a3",
    "userId": "64a1b2c3d4e5f6a7b8c9d0e1",
    "aiFunction": "resume_analysis",
    "success": true,
    "duration": 3500,
    "modelName": "deepseek-chat",
    "tokenUsage": { "input": 500, "output": 800 },
    "errorMessage": null,
    "createdAt": "2025-01-15T10:30:00.000Z",
    "updatedAt": "2025-01-15T10:30:00.000Z"
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/admin/ai-usage-records/64c3d4e5f6a7b8c9d0e1f2a3"
}
```

---

### 11. 删除 AI 使用记录

根据记录 ID 删除一条 AI 使用记录。

| 属性 | 值 |
|------|-----|
| **路径** | `DELETE /api/v1/admin/ai-usage-records/:id` |
| **认证** | ✅ JWT |

#### 请求参数（Path）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string (MongoId) | ✅ | AI 使用记录 ID |

#### 调用步骤

1. 从记录列表中确认要删除的记录 `_id`
2. 调用此接口执行删除
3. 确认返回 `{ deleted: true }`

#### 请求示例

```bash
curl -X DELETE http://localhost:3000/api/v1/admin/ai-usage-records/64c3d4e5f6a7b8c9d0e1f2a3 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "deleted": true
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/admin/ai-usage-records/64c3d4e5f6a7b8c9d0e1f2a3"
}
```

---

## 模块四：用户登出

### 12. 用户登出

将当前用户的 JWT Token 加入黑名单，使其立即失效。

| 属性 | 值 |
|------|-----|
| **路径** | `POST /api/v1/user/logout` |
| **认证** | ✅ JWT |

#### 请求参数

无（Token 从请求头 `Authorization: Bearer <token>` 中提取）。

#### 调用步骤

1. 确保已登录，获取 JWT Token
2. 调用此接口执行登出
3. 登出后 Token 被加入黑名单，后续使用该 Token 的请求将被拒绝
4. 前端清除本地存储的 Token

#### 请求示例

```bash
curl -X POST http://localhost:3000/api/v1/user/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

#### 响应示例

```json
{
  "code": 200,
  "message": "success",
  "data": {
    "message": "退出登录成功"
  },
  "timestamp": "2025-01-01T00:00:00.000Z",
  "path": "/api/v1/user/logout"
}
```

#### 实现原理

1. 从请求头提取 Bearer Token
2. 对 Token 做 SHA256 哈希
3. 将 `(token, tokenHash, expiresAt)` 写入 `token_blacklist` 集合
4. MongoDB TTL 索引在 `expiresAt` 到期后自动清理过期记录
5. `JwtStrategy` 验证每个请求时检查 Token 是否在黑名单中

---

## 汇总表

| # | 方法 | 路径 | 认证 | 模块 | 说明 |
|---|------|------|------|------|------|
| 1 | `GET` | `/api/v1/auth/gitee` | ❌ | Gitee OAuth | 获取 Gitee 授权 URL |
| 2 | `GET` | `/api/v1/auth/gitee/callback` | ❌ | Gitee OAuth | Gitee OAuth 回调（60s/10次） |
| 3 | `POST` | `/api/v1/resume-ai/analyze` | ✅ | 简历 AI | AI 分析简历与岗位匹配度 |
| 4 | `GET` | `/api/v1/resume-ai/analysis-records` | ✅ | 简历 AI | 获取分析记录列表（分页） |
| 5 | `GET` | `/api/v1/resume-ai/analysis-detail` | ✅ | 简历 AI | 获取分析详情 |
| 6 | `GET` | `/api/v1/resume-ai/latest-analysis` | ✅ | 简历 AI | 获取简历最近一次分析 |
| 7 | `GET` | `/api/v1/resume-ai/usage-records` | ✅ | 简历 AI | 获取 AI 使用记录（分页） |
| 8 | `GET` | `/api/v1/resume-ai/usage-stats` | ✅ | 简历 AI | 获取 AI 使用统计 |
| 9 | `GET` | `/api/v1/admin/ai-usage-records` | ✅ | 管理员 | 查询 AI 使用记录（多维度筛选） |
| 10 | `GET` | `/api/v1/admin/ai-usage-records/:id` | ✅ | 管理员 | 获取单条 AI 使用记录 |
| 11 | `DELETE` | `/api/v1/admin/ai-usage-records/:id` | ✅ | 管理员 | 删除 AI 使用记录 |
| 12 | `POST` | `/api/v1/user/logout` | ✅ | 用户 | 用户登出（Token 黑名单） |

### 认证分布

| 类型 | 数量 | 接口 |
|------|------|------|
| 需要 JWT 认证 | 10 | #3 ~ #12 |
| 无需认证 | 2 | #1 ~ #2（Gitee OAuth 流程） |

### 新增文件清单

| 文件 | 说明 |
|------|------|
| `src/gitee-auth/gitee-auth.controller.ts` | Gitee OAuth 控制器 |
| `src/gitee-auth/gitee-auth.service.ts` | Gitee OAuth 服务层 |
| `src/gitee-auth/dto/gitee-callback.dto.ts` | Gitee 回调 DTO |
| `src/resume-ai/resume-ai.controller.ts` | 简历 AI 控制器（新增 6 个分析+用量端点） |
| `src/resume-ai/ai-usage-record.controller.ts` | AI 使用记录管理控制器 |
| `src/resume-ai/ai-usage-record.service.ts` | AI 使用记录管理服务 |
| `src/resume-ai/dto/analyze-resume.dto.ts` | 分析简历 DTO |
| `src/resume-ai/dto/get-analysis-detail.dto.ts` | 分析详情 DTO |
| `src/resume-ai/dto/get-latest-analysis.dto.ts` | 最近分析 DTO |
| `src/resume-ai/dto/query-ai-usage-record.dto.ts` | AI 使用记录查询 DTO |
| `src/resume-ai/entities/resume-analysis-record.entity.ts` | 简历分析记录实体 |
| `src/resume-ai/entities/ai-usage-record.entity.ts` | AI 使用记录实体（含 AiFunctionEnum） |
| `src/auth/entities/token-blacklist.entity.ts` | Token 黑名单实体 |
| `src/common/utils/token.ts` | Token 提取工具函数 |
