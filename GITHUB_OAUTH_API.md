# GitHub OAuth API 接口文档

## 概述

本文档描述项目中 GitHub OAuth 2.0 登录的后端接口，基于授权码模式（Authorization Code Grant）实现。

**模块路径**: `src/github-auth/`

**路由前缀**: `/api/v1/auth/github`

---

## 环境变量配置

在 `.env` 文件中配置以下变量：

| 变量名 | 必填 | 说明 | 示例 |
|--------|------|------|------|
| `GITHUB_CLIENT_ID` | 是 | GitHub OAuth App 的 Client ID | `Ov23lisq3nqOMlxQNpj4` |
| `GITHUB_CLIENT_SECRET` | 是 | GitHub OAuth App 的 Client Secret | `63f8523f8eee...` |
| `GITHUB_REDIRECT_URI` | 是 | OAuth 回调地址（需与 GitHub App 设置一致） | `http://localhost:3000/api/v1/auth/github/callback` |
| `GITHUB_SCOPE` | 否 | 权限范围，默认 `read:user user:email` | `read:user user:email` |
| `GITHUB_FRONTEND_CALLBACK_URL` | 是 | 前端 OAuth 回调页地址 | `http://localhost:5173/auth/github/callback` |
| `ENCRYPTION_KEY` | 否 | 令牌加密密钥（不配置则明文存储） | `your-secret-key` |

### GitHub OAuth App 创建步骤

1. 访问 [GitHub Settings > Developer settings > OAuth Apps](https://github.com/settings/developers)
2. 点击 **New OAuth App**
3. 填写信息：
   - **Application name**: 你的应用名称
   - **Homepage URL**: `http://localhost:3000`
   - **Authorization callback URL**: `http://localhost:3000/api/v1/auth/github/callback`
4. 创建后获取 **Client ID** 和 **Client Secret**

---

## 接口列表

### 1. 发起 GitHub OAuth 授权

获取 GitHub 授权页面 URL，前端收到后应重定向用户到该地址。

#### 请求

```
GET /api/v1/auth/github
```

**请求参数**: 无

**请求头**: 无特殊要求

#### 响应

**成功响应** `200 OK`

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "authUrl": "https://github.com/login/oauth/authorize?client_id=Ov23lisq3nqOMlxQNpj4&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Fapi%2Fv1%2Fauth%2Fgithub%2Fcallback&scope=read%3Auser+user%3Aemail&state=abc123.def456",
    "state": "abc123.def456"
  },
  "timestamp": "2026-05-27T10:00:00.000Z",
  "path": "/api/v1/auth/github"
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `data.authUrl` | string | GitHub 授权页面完整 URL |
| `data.state` | string | CSRF 防护参数（5分钟有效，仅供调试） |

#### 前端使用示例

```javascript
// 方式一：直接重定向
async function loginWithGitHub() {
  const response = await fetch('/api/v1/auth/github');
  const { data } = await response.json();
  window.location.href = data.authUrl;
}

// 方式二：新窗口打开
async function loginWithGitHubPopup() {
  const response = await fetch('/api/v1/auth/github');
  const { data } = await response.json();
  window.open(data.authUrl, 'github-login', 'width=600,height=700');
}
```

---

### 2. GitHub OAuth 回调处理

GitHub 授权成功后重定向回来的地址。后端验证授权码、签发 JWT 后，302 重定向到前端回调页，token 通过 URL fragment 传递。

#### 请求

```
GET /api/v1/auth/github/callback?code={code}&state={state}
```

**查询参数**（使用通用 `OAuthCallbackDto` 校验）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `code` | string | 是 | GitHub 返回的授权码（一次性使用，有效期极短） |
| `state` | string | 是 | CSRF 防护参数（需与发起授权时一致） |

**速率限制**: 60 秒内最多 10 次

#### 响应

**成功响应** `302 Found`

重定向到 `{GITHUB_FRONTEND_CALLBACK_URL}#token={jwt}`

例如：`http://localhost:5173/auth/github/callback#token=eyJhbGciOiJIUzI1NiIs...`

**错误响应** `400 Bad Request`

```json
{
  "code": 400,
  "message": "state 参数无效或已过期，请重新发起授权",
  "data": null,
  "timestamp": "2026-05-27T10:00:00.000Z",
  "path": "/api/v1/auth/github/callback"
}
```

| 错误场景 | 错误信息 |
|----------|----------|
| state 无效/过期 | `state 参数无效或已过期，请重新发起授权` |
| code 无效/过期 | `授权码无效或已过期，请重新发起授权` |
| GitHub API 异常 | `获取 GitHub 用户信息失败，请重新授权` |

#### 前端使用示例

```javascript
// GitHubCallbackPage.vue 或 GitHubCallbackPage.jsx
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function GitHubCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    // 从 URL fragment 中提取 token
    const hash = window.location.hash.substring(1); // 去掉 # 号
    const params = new URLSearchParams(hash);
    const token = params.get('token');

    if (token) {
      // 存储 token
      localStorage.setItem('token', token);
      // 清除 URL 中的 fragment（安全考虑）
      window.history.replaceState(null, '', window.location.pathname);
      // 跳转到首页
      navigate('/home');
    } else {
      // 处理错误：没有 token
      console.error('GitHub 登录失败：未收到 token');
      navigate('/login');
    }
  }, [navigate]);

  return <div>正在处理 GitHub 登录...</div>;
}
```

---

## OAuth 完整流程

```
前端                          后端                           GitHub
  |                             |                              |
  |-- GET /api/v1/auth/github ->|                              |
  |<- { authUrl, state } -------|                              |
  |                             |                              |
  |-- 重定向到 authUrl --------------------------------------->|
  |                             |                              |
  |<- 302 redirect_uri?code=xx&state=yy ----------------------|
  |                             |                              |
  |-- GET /api/v1/auth/github/callback?code=xx&state=yy ----->|
  |                             |                              |
  |                             |-- 1. verifyState(state)      |
  |                             |-- 2. POST /login/oauth/access_token -->
  |                             |<- { access_token } ----------|
  |                             |-- 3. GET /api.github.com/user (Bearer) -->
  |                             |<- { id, login, name, ... } --|
  |                             |-- 4. findOrCreateOAuthUser() |
  |                             |-- 5. jwtService.sign()       |
  |                             |                              |
  |<- 302 FRONTEND_URL#token=jwt ------------------------------|
  |                             |                              |
  |-- 从 URL fragment 解析 token，存入 localStorage            |
```

---

## 用户创建/绑定策略

调用 `UserService.findOrCreateOAuthUser` 时，按以下优先级匹配：

| 优先级 | 匹配条件 | 行为 |
|--------|----------|------|
| 1 | 同平台（github）+ 同 platformUserId | 更新 access_token，返回已有用户 |
| 2 | 邮箱匹配已有用户 | 将 github 绑定到已有账户（账户关联） |
| 3 | 无匹配 | 创建新用户（password 为空，createdVia 为 `github`） |

### 注意事项

- **GitHub 邮箱隐私**: 用户可设置隐藏邮箱，此时 `email` 返回 `null`。系统会自动生成占位邮箱 `github_{id}@oauth.local`
- **GitHub Token 不过期**: 与 Gitee（24小时）不同，GitHub OAuth token 默认永不过期
- **同一 GitHub 账户重复登录**: 走优先级 1，仅更新 token，不会创建重复用户

---

## 数据结构

### GitHub 用户信息（从 GitHub API 获取）

```typescript
interface GitHubUserResponse {
  id: number;            // GitHub 用户数字 ID（唯一标识）
  login: string;         // GitHub 用户名
  name: string | null;   // 显示名称
  avatar_url: string;    // 头像 URL
  html_url: string;      // 个人主页 URL
  email: string | null;  // 邮箱（可能为 null）
  company: string | null;
  blog: string | null;
  location: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
}
```

### 存储到数据库的用户数据

```typescript
{
  platform: 'github',
  platformUserId: String(githubUser.id),  // GitHub 用户 ID
  accessToken: storedToken,               // 加密后的 access_token
  refreshToken: undefined,                // GitHub 不提供
  tokenExpiresAt: undefined,              // GitHub token 不过期
  nickname: githubUser.name || githubUser.login,
  avatarUrl: githubUser.avatar_url,
  profileUrl: githubUser.html_url,
  email: githubUser.email || undefined,
}
```

### JWT Token 载荷

```typescript
{
  userId: user._id,    // MongoDB 用户 ID
  username: user.username,
  email: user.email,
}
```

有效期：2 天（由 `JwtModule` 全局配置）

---

## 安全设计

| 安全措施 | 说明 |
|----------|------|
| CSRF 防护 | 无状态 HMAC 签名方案，state 参数 5 分钟过期 |
| 恒定时间比较 | state 验证使用自定义 `timingSafeEqual` 防时序攻击 |
| 令牌加密存储 | 使用 AES-256-GCM 加密 access_token（需配置 `ENCRYPTION_KEY`） |
| 速率限制 | 回调端点 60 秒最多 10 次 |
| Token 传递 | JWT 通过 URL fragment（`#token=xxx`）传递，不出现在服务器日志中 |
| 敏感信息过滤 | 返回用户对象时移除 password、accessToken 等字段 |

---

## 与 Gitee OAuth 的差异对比

| 特性 | GitHub | Gitee |
|------|--------|-------|
| 授权 URL | `https://github.com/login/oauth/authorize` | `https://gitee.com/oauth/authorize` |
| Token URL | `https://github.com/login/oauth/access_token` | `https://gitee.com/oauth/token` |
| 用户 API | `https://api.github.com/user` | `https://gitee.com/api/v5/user` |
| Token 传递方式 | `Authorization: Bearer` header | `?access_token=xxx` query 参数 |
| Token 过期时间 | 默认不过期 | 24 小时 |
| User-Agent 要求 | 必须设置（否则 403） | 无要求 |
| 默认 scope | `read:user user:email` | `user_info` |
| refresh_token | 不提供 | 提供 |

---

## 错误码参考

| HTTP 状态码 | 场景 | 消息 |
|-------------|------|------|
| 200 | 发起授权成功 | 返回 `{ authUrl, state }` |
| 302 | 回调处理成功 | 重定向到前端回调页 |
| 400 | state 无效/过期 | `state 参数无效或已过期，请重新发起授权` |
| 400 | 授权码无效/过期 | `授权码无效或已过期，请重新发起授权` |
| 400 | GitHub API 异常 | `获取 GitHub 用户信息失败，请重新授权` |
| 429 | 超过速率限制 | `ThrottlerException` |
