# AI 简历管理系统 API 文档

> 版本：v1.0
> 更新日期：2024-02-13
> 基础 URL：`http://localhost:3000`

---

## 目录

1. [概述](#1-概述)
2. [通用信息](#2-通用信息)
3. [认证说明](#3-认证说明)
4. [接口列表](#4-接口列表)
   - [4.1 用户模块 (User)](#41-用户模块-user)
   - [4.2 简历模块 (Resume)](#42-简历模块-resume)
   - [4.3 模板模块 (Template)](#43-模板模块-template)
   - [4.4 上传模块 (Upload)](#44-上传模块-upload)
5. [错误码说明](#5-错误码说明)
6. [数据模型](#6-数据模型)
7. [缺少的接口](#7-缺少的接口)

---

## 1. 概述

AI 简历管理系统是一个基于 NestJS + MongoDB 的在线简历制作平台，提供以下核心功能：

- **用户管理**：用户注册、登录、信息管理
- **简历管理**：创建、编辑、删除简历，支持 PDF 下载
- **模板管理**：将简历创建为模板，支持分页查询和模糊搜索
- **图片上传**：支持头像等图片上传

---

## 2. 通用信息

### 2.1 服务器地址

| 环境     | 地址                    |
| -------- | ----------------------- |
| 开发环境 | `http://localhost:3000` |
| 生产环境 | 待定                    |

### 2.2 API 版本

当前版本：`v1`
API 前缀：`/api/v1`

### 2.3 通信协议

- HTTP/HTTPS

### 2.4 数据格式

- 请求/响应：`application/json`
- 文件上传：`multipart/form-data`

### 2.5 统一响应格式

所有接口均返回统一的 JSON 格式：

```typescript
{
  code: number; // HTTP 状态码
  message: string; // 响应消息
  data: any; // 响应数据
  timestamp: string; // ISO 时间戳
  path: string; // 请求路径
}
```

#### 成功响应示例

```json
{
  "code": 200,
  "message": "操作成功",
  "data": { ... },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user"
}
```

#### 失败响应示例

```json
{
  "code": 400,
  "message": "请求参数错误",
  "data": null,
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user"
}
```

---

## 3. 认证说明

### 3.1 JWT Token 认证

系统使用 JWT（JSON Web Token）进行用户身份认证。

### 3.2 获取 Token

通过登录接口获取：

```
POST /api/v1/user/login
```

**请求参数：**

| 参数名   | 类型   | 必填 | 说明 |
| -------- | ------ | ---- | ---- |
| email    | string | 是   | 邮箱 |
| password | string | 是   | 密码 |

**响应示例：**

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI1MDdmMWY3N2JjZjg2Y2Q3OTk0MzkwMTEiLCJ1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiaWF0IjoxNzA3ODE0MDAwLCJleHAiOjE3MDgwMDA4MDB9.signature",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "username": "testuser",
      "email": "test@example.com"
    }
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user/login"
}
```

### 3.3 使用 Token

在需要认证的接口请求头中添加 `Authorization` 字段：

```
Authorization: Bearer {token}
```

**示例：**

```bash
curl -X GET http://localhost:3000/api/v1/resume \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 3.4 公开接口

以下接口不需要认证：

| 接口         | 方法 | 路径                   |
| ------------ | ---- | ---------------------- |
| 用户注册     | POST | `/api/v1/user`         |
| 用户登录     | POST | `/api/v1/user/login`   |
| 查询模板列表 | GET  | `/api/v1/template`     |
| 获取模板详情 | GET  | `/api/v1/template/:id` |
| 上传图片     | POST | `/api/v1/upload/image` |

---

## 4. 接口列表

### 4.1 用户模块 (User)

用户模块提供用户注册、登录和信息管理功能。

#### 4.1.1 用户注册

**接口描述**：创建新用户账号

**基础信息**

- 接口地址：`/api/v1/user`
- 请求方法：`POST`
- 认证要求：否

**请求参数**

##### Header

| 参数名       | 类型   | 必填 | 说明               |
| ------------ | ------ | ---- | ------------------ |
| Content-Type | string | 是   | `application/json` |

##### Body

| 参数名   | 类型   | 必填 | 验证规则  | 说明   |
| -------- | ------ | ---- | --------- | ------ |
| username | string | 是   | 非空      | 用户名 |
| password | string | 是   | 最小长度6 | 密码   |
| email    | string | 是   | 邮箱格式  | 邮箱   |

**请求示例**

```json
{
  "username": "zhangsan",
  "password": "123456",
  "email": "zhangsan@example.com"
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T10:00:00.000Z"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user"
}
```

##### 失败响应 (409 - 用户已存在)

```json
{
  "code": 409,
  "message": "用户名或邮箱已存在",
  "data": null,
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user"
}
```

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/user \
  -H "Content-Type: application/json" \
  -d '{
    "username": "zhangsan",
    "password": "123456",
    "email": "zhangsan@example.com"
  }'
```

---

#### 4.1.2 用户登录

**接口描述**：用户登录并返回 JWT Token

**基础信息**

- 接口地址：`/api/v1/user/login`
- 请求方法：`POST`
- 认证要求：否

**请求参数**

##### Body

| 参数名   | 类型   | 必填 | 验证规则 | 说明 |
| -------- | ------ | ---- | -------- | ---- |
| email    | string | 是   | 邮箱格式 | 邮箱 |
| password | string | 是   | 非空     | 密码 |

**请求示例**

```json
{
  "email": "zhangsan@example.com",
  "password": "123456"
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "_id": "507f1f77bcf86cd799439011",
      "username": "zhangsan",
      "email": "zhangsan@example.com"
    }
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user/login"
}
```

##### 失败响应 (400 - 密码错误)

```json
{
  "code": 400,
  "message": "用户名或密码错误",
  "data": null,
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user/login"
}
```

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/user/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "zhangsan@example.com",
    "password": "123456"
  }'
```

---

#### 4.1.3 获取当前用户信息

**接口描述**：获取当前登录用户的基本信息（不含密码）

**基础信息**

- 接口地址：`/api/v1/user/profile`
- 请求方法：`GET`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

**响应示例**

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T10:00:00.000Z"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user/profile"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/user/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.1.4 更新当前用户信息

**接口描述**：更新当前登录用户的基本信息（不支持在此修改密码）

**基础信息**

- 接口地址：`/api/v1/user/profile`
- 请求方法：`PATCH`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Body（可选）

| 参数名   | 类型   | 必填 | 说明   |
| -------- | ------ | ---- | ------ |
| username | string | 否   | 用户名 |
| email    | string | 否   | 邮箱   |

**请求示例**

```json
{
  "username": "lisi",
  "email": "lisi@example.com"
}
```

**响应示例**

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "lisi",
    "email": "lisi@example.com"
  },
  "timestamp": "2024-02-13T10:10:00.000Z",
  "path": "/api/v1/user/profile"
}
```

**cURL 示例**

```bash
curl -X PATCH http://localhost:3000/api/v1/user/profile \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "username": "lisi",
    "email": "lisi@example.com"
  }'
```

---

#### 4.1.5 修改密码

**接口描述**：校验旧密码后更新为新密码

**基础信息**

- 接口地址：`/api/v1/user/change-password`
- 请求方法：`PATCH`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Body

| 参数名      | 类型   | 必填 | 说明                |
| ----------- | ------ | ---- | ------------------- |
| oldPassword | string | 是   | 旧密码              |
| newPassword | string | 是   | 新密码（最少 6 位） |

**请求示例**

```json
{
  "oldPassword": "123456",
  "newPassword": "abc123456"
}
```

**响应示例**

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "message": "密码修改成功"
  },
  "timestamp": "2024-02-13T10:15:00.000Z",
  "path": "/api/v1/user/change-password"
}
```

**cURL 示例**

```bash
curl -X PATCH http://localhost:3000/api/v1/user/change-password \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "oldPassword": "123456",
    "newPassword": "abc123456"
  }'
```

#### 4.1.3 获取所有用户

**接口描述**：获取系统中所有用户列表（管理员功能）

**基础信息**

- 接口地址：`/api/v1/user`
- 请求方法：`GET`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "username": "zhangsan",
      "email": "zhangsan@example.com",
      "createdAt": "2024-02-13T10:00:00.000Z",
      "updatedAt": "2024-02-13T10:00:00.000Z"
    }
  ],
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/user \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.1.4 获取单个用户

**接口描述**：根据 ID 获取指定用户信息

**基础信息**

- 接口地址：`/api/v1/user/:id`
- 请求方法：`GET`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 用户ID | `507f1f77bcf86cd799439011` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "zhangsan",
    "email": "zhangsan@example.com",
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T10:00:00.000Z"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/user/507f1f77bcf86cd799439011"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/user/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.1.5 更新用户信息

**接口描述**：更新指定用户的信息

**基础信息**

- 接口地址：`/api/v1/user/:id`
- 请求方法：`PATCH`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 用户ID | `507f1f77bcf86cd799439011` |

##### Body (所有字段可选)

| 参数名   | 类型   | 必填 | 验证规则  | 说明                   |
| -------- | ------ | ---- | --------- | ---------------------- |
| username | string | 否   | 非空      | 用户名                 |
| password | string | 否   | 最小长度6 | 密码（更新时自动哈希） |
| email    | string | 否   | 邮箱格式  | 邮箱                   |

**请求示例**

```json
{
  "username": "lisi",
  "email": "lisi@example.com"
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "lisi",
    "email": "lisi@example.com",
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T11:00:00.000Z"
  },
  "timestamp": "2024-02-13T11:00:00.000Z",
  "path": "/api/v1/user/507f1f77bcf86cd799439011"
}
```

**cURL 示例**

```bash
curl -X PATCH http://localhost:3000/api/v1/user/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "username": "lisi",
    "email": "lisi@example.com"
  }'
```

---

#### 4.1.6 删除用户

**接口描述**：删除指定用户

**基础信息**

- 接口地址：`/api/v1/user/:id`
- 请求方法：`DELETE`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 用户ID | `507f1f77bcf86cd799439011` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439011",
    "username": "lisi",
    "email": "lisi@example.com",
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T11:00:00.000Z"
  },
  "timestamp": "2024-02-13T12:00:00.000Z",
  "path": "/api/v1/user/507f1f77bcf86cd799439011"
}
```

**cURL 示例**

```bash
curl -X DELETE http://localhost:3000/api/v1/user/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4.2 简历模块 (Resume)

简历模块提供简历的创建、编辑、删除和 PDF 下载功能。

#### 4.2.1 下载简历 PDF

**接口描述**：接收 HTML 和 CSS 内容，生成并返回 PDF 文件流

**基础信息**

- 接口地址：`/api/v1/resume/download`
- 请求方法：`POST`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Body

| 参数名 | 类型   | 必填 | 说明           |
| ------ | ------ | ---- | -------------- |
| html   | string | 是   | 简历 HTML 内容 |
| css    | string | 是   | 简历 CSS 样式  |

**请求示例**

```json
{
  "html": "<div class=\"resume\">...</div>",
  "css": ".resume { color: #333; }"
}
```

**响应格式**

- Content-Type: `application/pdf`
- Content-Disposition: `attachment; filename="resume.pdf"`
- 返回 PDF 文件流

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/resume/download \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "html": "<div class=\"resume\">...</div>",
    "css": ".resume { color: #333; }"
  }' \
  --output resume.pdf
```

---

#### 4.2.2 创建简历

**接口描述**：创建新简历，支持基于模板创建或创建空白简历

**基础信息**

- 接口地址：`/api/v1/resume`
- 请求方法：`POST`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Body (所有字段可选)

| 参数名               | 类型   | 必填 | 说明                     |
| -------------------- | ------ | ---- | ------------------------ |
| templateId           | string | 否   | 模板ID，基于模板创建简历 |
| title                | string | 否   | 简历标题                 |
| globalStyle          | object | 否   | 全局样式配置             |
| basicInfo            | object | 否   | 基础信息                 |
| jobIntention         | object | 否   | 求职意向                 |
| educationBackground  | array  | 否   | 教育背景数组             |
| workExperience       | array  | 否   | 工作经验数组             |
| campusExperience     | array  | 否   | 校园经历数组             |
| skills               | string | 否   | 技能特长                 |
| certificates         | string | 否   | 荣誉证书                 |
| projectExperience    | array  | 否   | 项目经历数组             |
| internshipExperience | array  | 否   | 实习经历数组             |
| selfEvaluation       | string | 否   | 自我评价                 |

**请求示例**

```json
{
  "title": "我的简历",
  "basicInfo": {
    "name": "张三",
    "phone": "13800138000",
    "email": "zhangsan@example.com"
  }
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "title": "我的简历",
    "basicInfo": { ... },
    "isTemplate": false,
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T10:00:00.000Z"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/resume"
}
```

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/resume \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "我的简历",
    "basicInfo": {
      "name": "张三",
      "phone": "13800138000",
      "email": "zhangsan@example.com"
    }
  }'
```

---

#### 4.2.3 获取所有模板列表

**接口描述**：获取系统中所有标记为模板的简历

**基础信息**

- 接口地址：`/api/v1/resume/templates`
- 请求方法：`GET`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439013",
      "title": "程序员简历模板",
      "isTemplate": true,
      "createdAt": "2024-02-13T10:00:00.000Z"
    }
  ],
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/resume/templates"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/resume/templates \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.2.4 获取用户所有简历

**接口描述**：获取当前登录用户的所有非模板简历

**基础信息**

- 接口地址：`/api/v1/resume`
- 请求方法：`GET`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": [
    {
      "_id": "507f1f77bcf86cd799439012",
      "userId": "507f1f77bcf86cd799439011",
      "title": "我的简历",
      "isTemplate": false,
      "createdAt": "2024-02-13T10:00:00.000Z"
    }
  ],
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/resume"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/resume \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.2.5 获取单个简历

**接口描述**：根据 ID 获取当前用户的单个简历

**基础信息**

- 接口地址：`/api/v1/resume/:id`
- 请求方法：`GET`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 简历ID | `507f1f77bcf86cd799439012` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "title": "我的简历",
    "basicInfo": { ... },
    "jobIntention": { ... },
    "educationBackground": [ ... ],
    "workExperience": [ ... ],
    "isTemplate": false,
    "createdAt": "2024-02-13T10:00:00.000Z",
    "updatedAt": "2024-02-13T10:00:00.000Z"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/resume/507f1f77bcf86cd799439012"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/resume/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.2.6 更新简历

**接口描述**：更新指定简历的信息

**基础信息**

- 接口地址：`/api/v1/resume/:id`
- 请求方法：`PATCH`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 简历ID | `507f1f77bcf86cd799439012` |

##### Body

| 参数名   | 类型   | 必填 | 说明                         |
| -------- | ------ | ---- | ---------------------------- |
| title    | string | 是   | 简历标题                     |
| 其他字段 | -      | 否   | 与创建简历相同的字段（可选） |

**请求示例**

```json
{
  "title": "更新后的简历",
  "basicInfo": {
    "name": "李四"
  }
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "title": "更新后的简历",
    "updatedAt": "2024-02-13T11:00:00.000Z"
  },
  "timestamp": "2024-02-13T11:00:00.000Z",
  "path": "/api/v1/resume/507f1f77bcf86cd799439012"
}
```

**cURL 示例**

```bash
curl -X PATCH http://localhost:3000/api/v1/resume/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "更新后的简历"
  }'
```

---

#### 4.2.7 删除简历

**接口描述**：删除指定简历

**基础信息**

- 接口地址：`/api/v1/resume/:id`
- 请求方法：`DELETE`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 简历ID | `507f1f77bcf86cd799439012` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439012",
    "title": "更新后的简历"
  },
  "timestamp": "2024-02-13T12:00:00.000Z",
  "path": "/api/v1/resume/507f1f77bcf86cd799439012"
}
```

**cURL 示例**

```bash
curl -X DELETE http://localhost:3000/api/v1/resume/507f1f77bcf86cd799439012 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

#### 4.2.8 复制简历

**接口描述**：根据简历 ID 复制当前用户的简历，生成一份新的非模板简历

**基础信息**

- 接口地址：`/api/v1/resume/:id/copy`
- 请求方法：`POST`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明           | 示例                       |
| ------ | ------ | ---- | -------------- | -------------------------- |
| id     | string | 是   | 待复制的简历ID | `507f1f77bcf86cd799439012` |

##### Body（可选）

| 参数名 | 类型   | 必填 | 说明                                    |
| ------ | ------ | ---- | --------------------------------------- |
| title  | string | 否   | 新简历标题，未提供则使用“原标题 (副本)” |

**请求示例**

```json
{
  "title": "我的简历 (副本)"
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439099",
    "userId": "507f1f77bcf86cd799439011",
    "title": "我的简历 (副本)",
    "isTemplate": false,
    "createdAt": "2024-02-13T13:00:00.000Z",
    "updatedAt": "2024-02-13T13:00:00.000Z"
  },
  "timestamp": "2024-02-13T13:00:00.000Z",
  "path": "/api/v1/resume/507f1f77bcf86cd799439012/copy"
}
```

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/resume/507f1f77bcf86cd799439012/copy \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "title": "我的简历 (副本)"
  }'
```

### 4.3 模板模块 (Template)

模板模块提供模板的创建、查询、更新和删除功能。

#### 4.3.1 创建模板

**接口描述**：将现有简历创建为模板

**基础信息**

- 接口地址：`/api/v1/template`
- 请求方法：`POST`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Body

| 参数名       | 类型   | 必填 | 说明               |
| ------------ | ------ | ---- | ------------------ |
| name         | string | 是   | 模板名称           |
| previewImage | string | 否   | 模板预览图URL      |
| category     | string | 是   | 适用岗位类型       |
| resumeId     | string | 是   | 要转为模板的简历ID |

**请求示例**

```json
{
  "name": "Java开发工程师模板",
  "previewImage": "/uploads/preview.png",
  "category": "技术",
  "resumeId": "507f1f77bcf86cd799439012"
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Java开发工程师模板",
    "previewImage": "/uploads/preview.png",
    "category": "技术",
    "usedCount": 0,
    "resumeId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "createdAt": "2024-02-13T10:00:00.000Z"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/template"
}
```

##### 失败响应 (400 - 简历已被设为模板)

```json
{
  "code": 400,
  "message": "该简历已被设为模板",
  "data": null,
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/template"
}
```

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/template \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Java开发工程师模板",
    "category": "技术",
    "resumeId": "507f1f77bcf86cd799439012"
  }'
```

---

#### 4.3.2 查询模板列表

**接口描述**：分页查询模板列表，支持按名称模糊搜索

**基础信息**

- 接口地址：`/api/v1/template`
- 请求方法：`GET`
- 认证要求：否

**请求参数**

##### Query Parameters

| 参数名   | 类型   | 必填 | 说明                               | 默认值 |
| -------- | ------ | ---- | ---------------------------------- | ------ |
| page     | number | 否   | 页码                               | 1      |
| pageSize | number | 否   | 每页数量                           | 10     |
| name     | string | 否   | 模板名称（模糊搜索，不区分大小写） | -      |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "list": [
      {
        "_id": "507f1f77bcf86cd799439013",
        "name": "Java开发工程师模板",
        "previewImage": "/uploads/preview.png",
        "category": "技术",
        "usedCount": 5,
        "createdAt": "2024-02-13T10:00:00.000Z"
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 10
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/template"
}
```

**cURL 示例**

```bash
curl -X GET "http://localhost:3000/api/v1/template?page=1&pageSize=10&name=Java"
```

---

#### 4.3.3 获取模板详情

**接口描述**：查询单个模板详情，包含关联的简历和用户信息

**基础信息**

- 接口地址：`/api/v1/template/:id`
- 请求方法：`GET`
- 认证要求：否

**请求参数**

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 模板ID | `507f1f77bcf86cd799439013` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "Java开发工程师模板",
    "previewImage": "/uploads/preview.png",
    "category": "技术",
    "usedCount": 5,
    "resumeId": "507f1f77bcf86cd799439012",
    "userId": "507f1f77bcf86cd799439011",
    "createdAt": "2024-02-13T10:00:00.000Z",
    "resume": {
      "title": "示例简历",
      "userId": "507f1f77bcf86cd799439011"
    },
    "user": {
      "username": "zhangsan",
      "email": "zhangsan@example.com"
    }
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/template/507f1f77bcf86cd799439013"
}
```

**cURL 示例**

```bash
curl -X GET http://localhost:3000/api/v1/template/507f1f77bcf86cd799439013
```

---

#### 4.3.4 更新模板

**接口描述**：更新模板信息（仅限模板创建者）

**基础信息**

- 接口地址：`/api/v1/template/:id`
- 请求方法：`PATCH`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明               |
| ------------- | ------ | ---- | ------------------ |
| Authorization | string | 是   | `Bearer {token}`   |
| Content-Type  | string | 是   | `application/json` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 模板ID | `507f1f77bcf86cd799439013` |

##### Body (所有字段可选)

| 参数名       | 类型   | 必填 | 说明          |
| ------------ | ------ | ---- | ------------- |
| name         | string | 否   | 模板名称      |
| previewImage | string | 否   | 模板预览图URL |
| category     | string | 否   | 适用岗位类型  |
| resumeId     | string | 否   | 简历ID        |

**请求示例**

```json
{
  "name": "更新后的模板名称",
  "category": "互联网"
}
```

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "更新后的模板名称",
    "category": "互联网",
    "updatedAt": "2024-02-13T11:00:00.000Z"
  },
  "timestamp": "2024-02-13T11:00:00.000Z",
  "path": "/api/v1/template/507f1f77bcf86cd799439013"
}
```

##### 失败响应 (403 - 无权限)

```json
{
  "code": 403,
  "message": "没有权限修改该模板",
  "data": null,
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/template/507f1f77bcf86cd799439013"
}
```

**cURL 示例**

```bash
curl -X PATCH http://localhost:3000/api/v1/template/507f1f77bcf86cd799439013 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "name": "更新后的模板名称"
  }'
```

---

#### 4.3.5 删除模板

**接口描述**：删除模板并恢复关联简历的非模板状态（仅限模板创建者）

**基础信息**

- 接口地址：`/api/v1/template/:id`
- 请求方法：`DELETE`
- 认证要求：是

**请求参数**

##### Header

| 参数名        | 类型   | 必填 | 说明             |
| ------------- | ------ | ---- | ---------------- |
| Authorization | string | 是   | `Bearer {token}` |

##### Path Parameters

| 参数名 | 类型   | 必填 | 说明   | 示例                       |
| ------ | ------ | ---- | ------ | -------------------------- |
| id     | string | 是   | 模板ID | `507f1f77bcf86cd799439013` |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "_id": "507f1f77bcf86cd799439013",
    "name": "更新后的模板名称"
  },
  "timestamp": "2024-02-13T12:00:00.000Z",
  "path": "/api/v1/template/507f1f77bcf86cd799439013"
}
```

**cURL 示例**

```bash
curl -X DELETE http://localhost:3000/api/v1/template/507f1f77bcf86cd799439013 \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

---

### 4.4 上传模块 (Upload)

上传模块提供图片上传功能。

#### 4.4.1 上传图片

**接口描述**：上传单个图片文件，返回图片的相对路径 URL

**基础信息**

- 接口地址：`/api/v1/upload/image`
- 请求方法：`POST`
- 认证要求：否

**请求参数**

##### Header

| 参数名       | 类型   | 必填 | 说明                  |
| ------------ | ------ | ---- | --------------------- |
| Content-Type | string | 是   | `multipart/form-data` |

##### Body (FormData)

| 参数名 | 类型 | 必填 | 说明     |
| ------ | ---- | ---- | -------- |
| file   | File | 是   | 图片文件 |

**响应格式**

##### 成功响应 (200)

```json
{
  "code": 200,
  "message": "操作成功",
  "data": {
    "url": "/uploads/1770126896183-862983048.png"
  },
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/upload/image"
}
```

##### 失败响应 (400 - 文件为空)

```json
{
  "code": 400,
  "message": "File is required",
  "data": null,
  "timestamp": "2024-02-13T10:00:00.000Z",
  "path": "/api/v1/upload/image"
}
```

**cURL 示例**

```bash
curl -X POST http://localhost:3000/api/v1/upload/image \
  -F "file=@/path/to/image.png"
```

---

## 5. 错误码说明

### 5.1 HTTP 状态码

| 状态码 | 说明                       |
| ------ | -------------------------- |
| 200    | 请求成功                   |
| 201    | 创建成功                   |
| 400    | 请求参数错误               |
| 401    | 未认证（Token 无效或过期） |
| 403    | 无权限操作                 |
| 404    | 资源不存在                 |
| 409    | 资源冲突（如用户已存在）   |
| 500    | 服务器内部错误             |

### 5.2 业务错误码

| 错误信息           | HTTP状态码 | 说明                           |
| ------------------ | ---------- | ------------------------------ |
| 用户名或邮箱已存在 | 409        | 注册时用户名或邮箱已被使用     |
| 用户不存在         | 404        | 查询的用户不存在               |
| 用户名或密码错误   | 400        | 登录时凭据不正确               |
| Token 无效或已过期 | 401        | JWT Token 验证失败             |
| 简历不存在         | 404        | 查询的简历不存在               |
| 模板不存在         | 404        | 查询的模板不存在               |
| 没有权限操作       | 403        | 用户无权访问或修改该资源       |
| 该简历已被设为模板 | 400        | 尝试将已是模板的简历再设为模板 |
| File is required   | 400        | 上传接口未提供文件             |

---

## 6. 数据模型

### 6.1 User (用户)

| 字段名    | 类型   | 必填 | 说明                             |
| --------- | ------ | ---- | -------------------------------- |
| \_id      | string | 是   | 用户ID                           |
| username  | string | 是   | 用户名（唯一）                   |
| email     | string | 是   | 邮箱（唯一）                     |
| password  | string | 是   | 密码（哈希存储，查询时自动过滤） |
| createdAt | string | 是   | 创建时间                         |
| updatedAt | string | 是   | 更新时间                         |

### 6.2 Resume (简历)

| 字段名               | 类型                   | 必填 | 说明                     |
| -------------------- | ---------------------- | ---- | ------------------------ |
| \_id                 | string                 | 是   | 简历ID                   |
| userId               | string                 | 是   | 所属用户ID               |
| user                 | ObjectId               | 是   | 用户对象引用             |
| title                | string                 | 否   | 简历标题                 |
| globalStyle          | GlobalStyle            | 否   | 全局样式                 |
| basicInfo            | BasicInfo              | 否   | 基础信息                 |
| jobIntention         | JobIntention           | 否   | 求职意向                 |
| educationBackground  | EducationBackground[]  | 否   | 教育背景数组             |
| workExperience       | WorkExperience[]       | 否   | 工作经验数组             |
| campusExperience     | CampusExperience[]     | 否   | 校园经历数组             |
| skills               | string                 | 否   | 技能特长                 |
| certificates         | string                 | 否   | 荣誉证书                 |
| projectExperience    | ProjectExperience[]    | 否   | 项目经历数组             |
| internshipExperience | InternshipExperience[] | 否   | 实习经历数组             |
| selfEvaluation       | string                 | 否   | 自我评价                 |
| cover                | string                 | 否   | 简历封面                 |
| isTemplate           | boolean                | 是   | 是否为模板（默认 false） |
| createdAt            | string                 | 是   | 创建时间                 |
| updatedAt            | string                 | 是   | 更新时间                 |

### 6.3 Template (模板)

| 字段名       | 类型     | 必填 | 说明               |
| ------------ | -------- | ---- | ------------------ |
| \_id         | string   | 是   | 模板ID             |
| name         | string   | 是   | 模板名称           |
| previewImage | string   | 否   | 预览图URL          |
| category     | string   | 是   | 适用岗位类型       |
| usedCount    | number   | 是   | 使用人数（默认 0） |
| resume       | ObjectId | 是   | 关联的简历对象     |
| resumeId     | string   | 是   | 对应简历ID         |
| userId       | string   | 是   | 创建人ID           |
| createdAt    | string   | 是   | 创建时间           |
| updatedAt    | string   | 是   | 更新时间           |

### 6.4 GlobalStyle (全局样式)

| 字段名       | 类型   | 必填 | 说明         |
| ------------ | ------ | ---- | ------------ |
| fontSize     | string | 否   | 字体大小     |
| moduleMargin | string | 否   | 模块上下间距 |
| pageMargin   | string | 否   | 页面左右间距 |
| lineHeight   | string | 否   | 行高         |

### 6.5 BasicInfo (基础信息)

| 字段名          | 类型   | 必填 | 说明     |
| --------------- | ------ | ---- | -------- |
| name            | string | 是   | 姓名     |
| gender          | string | 否   | 性别     |
| phone           | string | 否   | 手机号   |
| age             | string | 否   | 年龄     |
| email           | string | 否   | 邮箱     |
| avatar          | string | 否   | 头像URL  |
| politicalStatus | string | 否   | 政治面貌 |
| workYear        | string | 否   | 工作年限 |

### 6.6 JobIntention (求职意向)

| 字段名            | 类型   | 必填 | 说明     |
| ----------------- | ------ | ---- | -------- |
| jobIntention      | string | 否   | 求职意向 |
| intentionCity     | string | 否   | 意向城市 |
| expectationSalary | string | 否   | 期望薪资 |
| entryTime         | string | 否   | 入职时间 |

### 6.7 EducationBackground (教育背景)

| 字段名         | 类型   | 必填 | 说明     |
| -------------- | ------ | ---- | -------- |
| schoolName     | string | 否   | 学校名称 |
| degree         | string | 否   | 学历层次 |
| major          | string | 否   | 专业     |
| enrollmentTime | string | 否   | 入学时间 |
| graduationTime | string | 否   | 毕业时间 |
| content        | string | 否   | 详细内容 |

### 6.8 WorkExperience (工作经验)

| 字段名          | 类型   | 必填 | 说明     |
| --------------- | ------ | ---- | -------- |
| companyName     | string | 否   | 公司名称 |
| position        | string | 否   | 职位     |
| workTime        | string | 否   | 入职时间 |
| dismissalTime   | string | 否   | 离职时间 |
| workDescription | string | 否   | 工作描述 |

### 6.9 CampusExperience (校园经历)

| 字段名      | 类型   | 必填 | 说明     |
| ----------- | ------ | ---- | -------- |
| startTime   | string | 否   | 开始时间 |
| endTime     | string | 否   | 结束时间 |
| title       | string | 否   | 经历名称 |
| description | string | 否   | 经历描述 |
| content     | string | 否   | 经历内容 |

### 6.10 ProjectExperience (项目经历)

| 字段名      | 类型   | 必填 | 说明     |
| ----------- | ------ | ---- | -------- |
| startTime   | string | 否   | 开始时间 |
| endTime     | string | 否   | 结束时间 |
| title       | string | 否   | 项目名称 |
| description | string | 否   | 项目描述 |
| content     | string | 否   | 项目内容 |

### 6.11 InternshipExperience (实习经历)

| 字段名      | 类型   | 必填 | 说明     |
| ----------- | ------ | ---- | -------- |
| startTime   | string | 否   | 开始时间 |
| endTime     | string | 否   | 结束时间 |
| companyName | string | 否   | 公司名称 |
| position    | string | 否   | 职位     |
| description | string | 否   | 实习描述 |

---

## 7. 缺少的接口

### 7.1 User 模块缺少的接口

| 接口     | 方法 | 路径           | 优先级 | 说明                     |
| -------- | ---- | -------------- | ------ | ------------------------ |
| 退出登录 | POST | `/user/logout` | 中     | 清除 Token（客户端实现） |

### 7.2 Resume 模块缺少的接口

| 接口          | 方法 | 路径                  | 优先级 | 说明                 |
| ------------- | ---- | --------------------- | ------ | -------------------- |
| 简历预览      | GET  | `/resume/:id/preview` | 中     | 获取简历预览数据     |
| 搜索简历      | GET  | `/resume/search`      | 中     | 按关键词搜索用户简历 |
| 导出简历 JSON | GET  | `/resume/:id/export`  | 中     | 导出简历为 JSON 格式 |
| 导入简历 JSON | POST | `/resume/import`      | 中     | 从 JSON 导入简历数据 |

### 7.3 Template 模块缺少的接口

| 接口               | 方法   | 路径                           | 优先级 | 说明                        |
| ------------------ | ------ | ------------------------------ | ------ | --------------------------- |
| 使用模板创建简历   | POST   | `/template/:id/use`            | 高     | 使用模板创建新简历          |
| 按分类获取模板     | GET    | `/template/category/:category` | 中     | 获取指定分类的模板          |
| 获取热门模板       | GET    | `/template/popular`            | 中     | 根据 usedCount 获取热门模板 |
| 收藏模板           | POST   | `/template/:id/favorite`       | 中     | 用户收藏模板                |
| 取消收藏模板       | DELETE | `/template/:id/favorite`       | 中     | 取消收藏                    |
| 获取用户收藏的模板 | GET    | `/template/favorites`          | 中     | 获取当前用户收藏的模板      |

### 7.4 缺失的功能模块

| 模块         | 说明                                       | 优先级 |
| ------------ | ------------------------------------------ | ------ |
| Share 模块   | 简历分享功能（生成分享链接、访问分享简历） | 高     |
| History 模块 | 简历历史记录功能                           | 中     |

---

## 更新日志

| 日期       | 版本 | 更新内容                                                       |
| ---------- | ---- | -------------------------------------------------------------- |
| 2024-02-13 | v1.0 | 初始版本，包含 User、Resume、Template、Upload 模块共 19 个接口 |
