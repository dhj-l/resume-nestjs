# 模拟面试模块接口文档

## 接口概述

模拟面试：基于岗位 JD + 用户选择的简历，AI 扮演面试官进行**逐题自适应**对话（根据回答动态追问/切换主题），面试结束后生成评价报告。

| 项目 | 说明 |
|------|------|
| **基础路径** | `/api/v1/interview` |
| **认证方式** | JWT Bearer Token（所有接口均需登录） |
| **内容类型** | `application/json` |
| **限流规则** | 每个 IP 每 60 秒最多 10 次请求（叠加全局 30 次/分钟限制） |

### 核心概念

- **轮次（round）**：一次提问 + 一次回答为一轮。目标轮次由面试侧重决定：技术面 8 轮、项目面 6 轮、综合面 10 轮
- **单会话约束**：同一用户同时只能有一个 `in_progress` 会话，创建前需先完成或中断旧会话
- **会话超时**：30 分钟无任何活动自动关闭（`endedReason=timeout`），不生成报告

---

## 面试级别（多维度组合）

`levelConfig` 由两个维度组合而成：

### experienceLevel 经验层级

| 枚举值 | 说明 |
|--------|------|
| `junior` | 校招/应届生 |
| `mid` | 1-3 年经验 |
| `senior` | 3-5 年经验 |
| `expert` | 5 年以上经验 |

### focus 考察侧重

| 枚举值 | 说明 | 目标轮次 |
|--------|------|----------|
| `technical` | 技术面 | 8 |
| `project` | 项目深挖面 | 6 |
| `mixed` | 技术与项目综合 | 10 |

---

## 会话状态说明

### status

| 枚举值 | 说明 |
|--------|------|
| `in_progress` | 进行中 |
| `completed` | 已完成（有报告） |
| `cancelled` | 已关闭（无报告） |

### endedReason 结束原因

| 枚举值 | 说明 | 前端建议处理 |
|--------|------|--------------|
| `completed` | 达到目标轮次自然结束 | 展示报告 |
| `ai_suggest` | AI 判定可提前结束（≥3 轮后） | 展示报告 |
| `user_finish` | 用户主动收尾 | 展示报告 |
| `user_cancel` | 用户强制中断 | 提示"已中断，未生成报告" |
| `timeout` | 30 分钟无回复超时关闭 | 提示"上次面试因超时已关闭"，可发起新面试 |

> ⚠️ `cancelled` 状态的会话**没有报告**；`completed` 状态的会话才有 `report` 字段。

---

## 通用响应包络

所有 JSON 接口返回统一格式（全局拦截器处理）：

```jsonc
// 成功
{
  "code": 200,
  "message": "操作成功",
  "data": { /* 各接口的业务数据 */ },
  "timestamp": "2026-08-25T12:00:00.000Z",
  "path": "/api/v1/interview/sessions"
}

// 失败
{
  "code": 400,
  "message": "错误描述",
  "data": null,
  "timestamp": "2026-08-25T12:00:00.000Z",
  "path": "/api/v1/interview/sessions"
}
```

### 常见业务错误码

| HTTP 码 | 场景 |
|---------|------|
| 400 | JD 内容不合规 / 简历不存在 / 会话 ID 格式错误 / 报告尚未生成 |
| 401 | 未登录或 token 失效 |
| 404 | 面试会话不存在（或非本人会话） |
| 409 | 已有进行中的会话 / 会话已结束 / 会话已超时 |
| 429 | 触发限流 |
| 500 | 服务器内部错误（含 AI 调用重试耗尽） |

---

## 1. 创建面试会话

校验 JD 与简历归属 → AI 生成考察大纲 → 生成并返回第一题。**耗时较长（两次 AI 调用），前端请做好 loading 提示。**

- **URL**: `POST /interview/sessions`

### 请求体

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `resumeId` | string | 是 | 用于面试的简历 ID（MongoDB ObjectId），必须是当前用户自己的简历 |
| `jobDescription` | string | 是 | 岗位 JD，150-5000 字符；需包含职位/职责/要求等关键信息字段 |
| `levelConfig` | object | 是 | 面试级别配置 |
| `levelConfig.experienceLevel` | string | 是 | `junior` / `mid` / `senior` / `expert` |
| `levelConfig.focus` | string | 是 | `technical` / `project` / `mixed` |

```json
{
  "resumeId": "507f1f77bcf86cd799439011",
  "jobDescription": "Node.js 后端开发工程师\n工作地点：上海\n职位描述：\n1、负责服务端接口研发……\n任职要求：\n1、本科及以上学历……\n薪资范围：25k-40k",
  "levelConfig": {
    "experienceLevel": "mid",
    "focus": "technical"
  }
}
```

### 响应 data（InterviewSession）

```jsonc
{
  "_id": "66ea00000000000000000001",
  "userId": "66e90000000000000000000a",
  "resumeId": "507f1f77bcf86cd799439011",
  "jobDescription": "……",
  "levelConfig": { "experienceLevel": "mid", "focus": "technical" },
  "status": "in_progress",
  "outline": [
    {
      "key": "nodejs_event_loop",       // 大纲主题唯一标识
      "title": "Node.js 事件循环",
      "description": "考察事件循环与微任务机制的掌握深度",
      "difficulty": "进阶"               // 基础/进阶/高阶
    }
  ],
  "currentRound": 1,                     // 当前轮次（从 1 开始）
  "targetRounds": 8,
  "askedTopicKeys": ["nodejs_event_loop"],
  "messages": [                          // 对话记录，按时间顺序
    {
      "role": "interviewer",             // interviewer=AI面试官 / candidate=用户
      "content": "你好，请先介绍一下你在上一个项目中承担的职责。",
      "round": 1,
      "kind": "question",                // question / answer
      "channel": "text",                 // text / voice（voice 为语音扩展预留）
      "askedAt": "2026-08-25T12:00:05.000Z"
    }
  ],
  "report": null,                        // 完成后才有值
  "lastActivityAt": "2026-08-25T12:00:05.000Z",
  "expiresAt": "2026-08-25T12:30:05.000Z", // 超过此时间无活动将自动关闭
  "startedAt": "2026-08-25T12:00:03.000Z",
  "endedAt": null
}
```

### 可能的错误

| code | message 示例 |
|------|--------------|
| 400 | `JD内容过短，中文需至少150字符…` / `JD缺少必要的关键信息字段…` / `简历不存在` |
| 409 | `您已有一个进行中的面试会话，请先完成或中断` |

---

## 2. 获取我的当前会话

查询当前用户的进行中会话；若该会话已超时，会**自动关闭并原样返回**（status 变为 cancelled）。用于页面进入时恢复现场或检测超时。

- **URL**: `GET /interview/sessions/current`
- **参数**: 无

### 响应 data

```jsonc
{
  "active": true,          // false 表示没有进行中的会话
  "session": { /* InterviewSession 结构同上 */ }
}
```

> 前端逻辑：
> - `active=true` → 恢复面试界面（渲染 session.messages）
> - `active=false && session.status==='cancelled' && session.endedReason==='timeout'` → 提示"上次面试因超时已关闭"
> - `active=false && session===null` → 正常展示发起面试入口

---

## 3. 获取会话详情

- **URL**: `GET /interview/sessions/:id`
- **参数**: `id` — 会话 ID（路径参数）

### 响应 data

InterviewSession 结构同上（含全部 messages 与 outline；已完成时含 report）。

---

## 4. 提交回答（同步）

提交候选人回答，AI 决策下一题（追问或切换主题）。最后一轮回答会**自动结束面试并生成报告**（本次请求耗时较长）。

- **URL**: `POST /interview/sessions/:id/answers`

### 请求体

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `content` | string | 是 | 回答内容，非空，最长 5000 字 |
| `channel` | string | 否 | 回答渠道，默认 `text`；预留 `voice` |

```json
{ "content": "事件循环主要分为宏任务和微任务队列……" }
```

### 响应 data —— 未结束（继续对话）

```jsonc
{
  "finished": false,
  "nextQuestion": "那你能展开讲讲宏任务和微任务的执行顺序吗？", // 直接展示给用户
  "round": 3,              // 下一题所在轮次
  "targetRounds": 8
}
```

### 响应 data —— 面试已结束（finished=true）

```jsonc
{
  "finished": true,
  "endedReason": "completed",   // completed / ai_suggest
  "targetRounds": 8
  // 注意：finished 时没有 nextQuestion
}
```

### 可能的错误

| code | message 示例 |
|------|--------------|
| 409 | `该面试会话已结束` / `面试会话因长时间无回复已自动结束，请重新发起面试` |

---

## 5. 提交回答（SSE 流式变体）

与接口 4 的核心逻辑完全一致，仅传输方式不同：以 Server-Sent Events 实时推送结果事件。适合需要更细粒度加载反馈的场景，也为后续语音 TTS 文本流预留。

- **URL**: `POST /interview/sessions/:id/answers/stream`
- **请求体**: 同接口 4
- **响应格式**: `text/event-stream`

### SSE 事件帧协议

每帧格式为 `data: <JSON>\n\n`，JSON 结构：

| type | 时机 | data 内容 |
|------|------|-----------|
| `init` | 连接建立后立即推送一次 | 无 |
| `question` | 生成完成且面试继续 | `{ finished:false, nextQuestion, round, targetRounds }` |
| `finished` | 本轮回答触发面试结束 | `{ finished:true, endedReason, targetRounds }` |
| `error` | 服务端处理失败 | 无，随后连接关闭 |

```text
data: {"type":"init","message":"开始处理回答"}

data: {"type":"question","data":{"finished":false,"nextQuestion":"下一题内容","round":3,"targetRounds":8}}

```

> 业务性错误（409 已结束/已超时、400 等）在**建连前**抛出，此时响应是标准 JSON 错误包络而非 SSE——前端需按响应 Content-Type 区分处理。客户端断开会自动取消订阅。

---

## 6. 用户主动收尾（生成报告）

提前结束面试并**立即基于已有问答生成评价报告**。至少应有 1 轮问答，否则报告质量无法保证。

- **URL**: `POST /interview/sessions/:id/finish`
- **请求体**: 无

### 响应 data

InterviewSession（status=`completed`，endedReason=`user_finish`，report 已填充）。耗时较长（AI 生成报告），前端做好 loading。

---

## 7. 强制中断面试

立即关闭会话，**不调用 AI、不生成报告**，同时释放单会话名额。适用于用户直接放弃面试的场景。

- **URL**: `POST /interview/sessions/:id/cancel`
- **请求体**: 无
- **响应 data**: InterviewSession（status=`cancelled`，endedReason=`user_cancel`）

> finish 与 cancel 的语义区分：**finish = 正常交卷出成绩单；cancel = 弃考**。请按用户意图选择。

---

## 8. 获取评价报告

- **URL**: `GET /interview/sessions/:id/report`
- **参数**: `id` — 会话 ID（路径参数）

### 响应 data（Report）

```jsonc
{
  "overallScore": 78,                  // 总分 0-100
  "summary": "整体表现良好，与岗位要求匹配度较高……", // 总评，≤300字
  "recommendation": "推荐",            // 强烈推荐/推荐/待定/不推荐
  "topics": [                          // 逐主题评分（仅覆盖实际考察到的主题）
    {
      "topicKey": "nodejs_event_loop",
      "title": "Node.js 事件循环",
      "score": 82,
      "comment": "原理讲解清晰，缺少生产环境调优经验。"
    }
  ],
  "strengths": ["基础扎实，表达有条理"],
  "weaknesses": ["缺少性能问题的定位手段"],
  "suggestions": ["深入学习 Node.js 性能剖析工具"]
}
```

### 错误

| code | message |
|------|---------|
| 400 | `该面试尚未生成评价报告` |

---

## 推荐联调流程

```text
1. POST /sessions                    创建会话（loading："正在准备面试…"）
2. 渲染 session.messages 最后一题     ← 第一题
3. 循环：
   a. 用户输入回答
   b. POST /answers 或 /answers/stream
   c. finished=false → 追加 nextQuestion 继续对话
      finished=true  → 跳转报告页
4. 用户随时可：
   - POST /finish    收尾出报告（跳报告页）
   - POST /cancel    放弃面试（回首页）
5. 报告页：GET /report
6. 异常恢复：每次进入面试页先调 GET /sessions/current，
   根据 active / endedReason 判断恢复现场或提示超时
```

### 前端注意事项汇总

1. 创建会话、最后一条回答、finish 三类请求耗时较长（多次 AI 调用），务必做 loading 与超时兜底
2. `finished=true` 的回答响应中没有 `nextQuestion`，不要渲染空题目
3. 收到 409 且 message 含「长时间无回复」时，引导用户重新发起面试
4. 会话详情中的 `expiresAt` 可用于前端倒计时展示剩余作答时间
5. 所有枚举（级别、状态、结束原因）以后端为准，前端做未知值的兜底展示
