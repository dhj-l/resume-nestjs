# 模拟面试模块接口文档

## 接口概述

模拟面试：基于岗位 JD + 用户选择的简历，AI 扮演真实大厂面试官进行**分阶段**模拟——自我介绍开场 → 项目深挖为主线的主体考察 → 反问环节收尾，每题回答后即时返回三维度反馈，结束后生成评价报告。

| 项目 | 说明 |
|------|------|
| **基础路径** | `/api/v1/interview` |
| **认证方式** | JWT Bearer Token（所有接口均需登录） |
| **内容类型** | `application/json` |
| **限流规则** | 每个 IP 每 60 秒最多 10 次请求（叠加全局 30 次/分钟限制） |

### 核心概念

- **阶段（phase）**：一场面试分为两个阶段
  - `main` 主体考察：自我介绍开场，项目深挖约占 70%，其余为八股/系统设计/开放性问题
  - `reverse` 反问环节：主体考察结束后，候选人可向面试官提 1~3 个问题，AI 以面试官身份真实回应
- **时长驱动结束**：面试结束不再按题目数判定，而由面试时长驱动
  - 主体考察 **不足 30 分钟**：禁止进入结束环节（AI 的收尾建议一律忽略）
  - **满 30 分钟且超过 15 题**：AI 可根据候选人回答判断是否进入结束环节
  - **满 60 分钟**：服务端强制进入结束环节（AI 生成自然收尾语并引导反问）
  - 大纲主题用尽后 AI 会基于 JD 与简历**自主出题**（优先继续深挖项目），支撑长面试
- **候选人主动终止**：候选人在回答中明确要求终止/放弃面试（如「终止面试」「我有急事得走」）时，**不受时长政策限制**——AI 输出告别语后立即结束并生成报告（`endedReason=user_finish`），告别语经 SSE `closing` 帧先推给前端。注意这与「收尾出报告」按钮（`POST /finish`）等效，只是触发方式为对话内容
- **逐题反馈（feedback）**：每次回答后，AI 从**完整性 / 逻辑性 / 技术深度**三个维度打分并给一句话点评，随下一题一并返回（零额外等待）
- **单会话约束**：同一用户同时只能有一个 `in_progress` 会话，创建前需先完成或中断旧会话；若旧会话已超过不活动窗口（含创建流程崩溃残留的占位会话），新建请求会自动关闭它并正常创建，不会阻塞
- **会话超时**：45 分钟无任何活动自动关闭（`endedReason=timeout`），不生成报告；创建流程中的占位会话（大纲尚未生成）只授予 8 分钟过期窗口（覆盖大纲生成最坏耗时），异常残留最多阻塞新建 8 分钟

---

## 面试级别（多维度组合）

`levelConfig` 由三个维度组合而成（旧版 `focus` 维度已由 `stage` 取代）：

### mode 面试模式

| 枚举值 | 说明 | 经验层级要求 |
|--------|------|--------------|
| `campus` | 校招模式：基础全面偏原理、项目验证真实性、重潜力 | 固定为 `junior`（无需传，服务端归一化） |
| `experienced` | 社招模式：项目深挖结合实践与量化、重深度与架构 | 必填 `mid` / `senior` / `expert`（传 `junior` 会被拒绝） |

### stage 面试轮次

| 枚举值 | 说明 | 面试官人设 | 考察配比 |
|--------|------|-----------|----------|
| `first` | 一面·基础技术面 | 未来同组资深工程师 | 自我介绍 1 题 + 项目/实习深挖约 70% + 八股基础约 30% |
| `second` | 二面·项目深入面 | 直属 Leader | 自我介绍 1 题 + 项目深挖约 70%（选型/架构/难点/量化）+ 系统设计与开放问题约 30% |
| `third` | 三面·综合面 | 总监/交叉面官 | 自我介绍 1 题 + 项目引申至架构与决策约 60% + 技术广度与开放性问题约 40% |

### experienceLevel 经验层级

| 枚举值 | 说明 |
|--------|------|
| `junior` | 校招/应届生（campus 模式专用） |
| `mid` | 1-3 年经验 |
| `senior` | 3-5 年经验 |
| `expert` | 5 年以上经验 |

### questionType 题目类型

大纲主题与面试官消息均携带 `questionType`：`self_intro`（自我介绍）/ `project`（项目深挖）/ `fundamentals`（八股）/ `system_design`（系统设计）/ `open_question`（开放性）/ `reverse`(反问环节)。

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
| `completed` | 反问环节结束自然收尾 | 展示报告 |
| `user_finish` | 用户主动收尾（任意阶段可触发） | 展示报告 |
| `user_cancel` | 用户强制中断 | 提示"已中断，未生成报告" |
| `timeout` | 45 分钟无回复超时关闭 | 提示"上次面试因超时已关闭"，可发起新面试 |

> ⚠️ `cancelled` 状态的会话**没有报告**；`completed` 状态的会话才有 `report` 字段。旧版 `ai_suggest` 已废弃（AI 的收尾建议现在表现为转入反问环节，最终以 `completed` 结束）。

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
| 400 | JD 内容不合规 / 简历不存在 / 社招模式缺经验层级 / 会话 ID 格式错误 / 报告尚未生成 |
| 401 | 未登录或 token 失效 |
| 404 | 面试会话不存在（或非本人会话） |
| 409 | 已有进行中的会话 / 会话已结束 / 会话已超时 |
| 429 | 触发限流 |
| 500 | 服务器内部错误（含 AI 调用重试耗尽） |

---

## 1. 创建面试会话

校验 JD 与简历归属 → AI 生成考察大纲 → 返回自我介绍开场白（首题为本地模板，仅一次 AI 调用）。

- **URL**: `POST /interview/sessions`

### 请求体

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `resumeId` | string | 是 | 用于面试的简历 ID（MongoDB ObjectId），必须是当前用户自己的简历 |
| `jobDescription` | string | 是 | 岗位 JD，150-5000 字符；需包含职位/职责/要求等关键信息字段 |
| `levelConfig` | object | 是 | 面试级别配置 |
| `levelConfig.mode` | string | 是 | `campus` / `experienced` |
| `levelConfig.stage` | string | 是 | `first` / `second` / `third` |
| `levelConfig.experienceLevel` | string | 条件 | 社招必填 `mid`/`senior`/`expert`；校招无需传 |

```json
{
  "resumeId": "507f1f77bcf86cd799439011",
  "jobDescription": "Node.js 后端开发工程师\n工作地点：上海\n职位描述：\n1、负责服务端接口研发……\n任职要求：\n1、本科及以上学历……\n薪资范围：25k-40k",
  "levelConfig": {
    "mode": "experienced",
    "stage": "second",
    "experienceLevel": "senior"
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
  "levelConfig": { "mode": "experienced", "stage": "second", "experienceLevel": "senior" },
  "status": "in_progress",
  "phase": "main",                       // main 主体考察 / reverse 反问环节
  "outline": [
    {
      "key": "self_intro",               // 大纲主题唯一标识
      "title": "自我介绍",
      "description": "引导候选人做 2 分钟左右的自我介绍",
      "difficulty": "基础",
      "questionType": "self_intro"       // 主题题型（第一个主题固定 self_intro）
    },
    {
      "key": "order_system_refactor",
      "title": "订单系统重构",
      "difficulty": "高阶",
      "questionType": "project"
    }
  ],
  "currentRound": 1,                     // 当前轮次（从 1 开始，含反问环节持续递增）
  "askedTopicKeys": ["self_intro"],
  "messages": [                          // 对话记录，按时间顺序
    {
      "role": "interviewer",             // interviewer=AI面试官 / candidate=用户
      "content": "你好，我是今天二面（项目深入面）的面试官……先请你做个自我介绍。",
      "round": 1,
      "kind": "question",                // question / answer
      "questionType": "self_intro",      // 该题的题型
      "channel": "text",                 // text / voice（voice 为语音扩展预留）
      "askedAt": "2026-08-25T12:00:05.000Z"
    }
  ],
  "report": null,                        // 完成后才有值
  "lastActivityAt": "2026-08-25T12:00:05.000Z",
  "expiresAt": "2026-08-25T12:45:05.000Z", // 超过此时间无活动将自动关闭（45 分钟窗口）
  "startedAt": "2026-08-25T12:00:03.000Z",
  "endedAt": null,
  "pendingReportReason": null            // 收尾待出报告标记，正常流程不出现（见下）
}
```

> **`pendingReportReason`**：仅在一次收尾（反问结束 / 候选人主动终止）的告别语已落库、
> 但评价报告生成失败时出现，此时 `status` 仍是 `in_progress`。前端无需特殊处理：
> 重发同一请求（或调 `POST /finish`）会**只补生成报告**，不再重复推进对话，
> 成功后返回正常的 `finished=true` 结果并从会话中清除该字段。

> 旧版 `targetRounds` 字段已废弃：结束由面试时长驱动，新会话不再返回该字段。

### 可能的错误

| code | message 示例 |
|------|--------------|
| 400 | `JD内容过短…` / `简历不存在` / `社招模式请选择 mid/senior/expert 经验层级` |
| 409 | `您已有一个进行中的面试会话，请先完成或中断` / `面试会话已结束，请重新发起面试`（占位会话在生成大纲期间已过期被清扫，重试即可） |

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
> - `active=true` → 恢复面试界面（渲染 session.messages；`phase=reverse` 时进入反问界面）
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

提交候选人回答。AI 一次回合决策同时产出**逐题反馈**与**下一动作**（追问/推进大纲/进入反问环节）；反问环节中该接口用于提交候选人的提问，AI 以面试官身份回应，反问结束后**自动生成报告**。

- **URL**: `POST /interview/sessions/:id/answers`

### 请求体

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| `content` | string | 是 | 回答内容（反问环节为候选人的问题），非空，最长 5000 字 |
| `channel` | string | 否 | 回答渠道，默认 `text`；预留 `voice` |

```json
{ "content": "订单系统的分库分表方案是这样的……" }
```

### 响应 data —— 主体考察继续（phase=main）

```jsonc
{
  "finished": false,
  "feedback": {                          // 逐题即时反馈（直接展示给用户）
    "completeness": 70,                  // 完整性 0-100
    "logic": 85,                         // 逻辑性 0-100
    "depth": 55,                         // 技术深度 0-100
    "comment": "讲清了方案，缺少量化数据"  // 一句话点评
  },
  "nextQuestion": "重构后 QPS 提升了多少？你有观测数据吗？",
  "round": 3,
  "phase": "main",
  "elapsedMinutes": 18,                  // 主体考察已进行分钟数
  "askedCount": 3                        // 累计已问题数（含本次）
}
```

### 响应 data —— 转入反问环节（phase=reverse）

主体考察结束时（满 30 分钟且超 15 题后 AI 判断收尾，或满 60 分钟强制收尾），响应中 `nextQuestion` 为面试官的**自然收尾语 + 反问引导**：

```jsonc
{
  "finished": false,
  "feedback": { "completeness": 75, "logic": 80, "depth": 70, "comment": "……" },
  "nextQuestion": "好的，今天的交流就到这里……最后留几分钟给你，你有什么想问我的吗？",
  "round": 18,
  "phase": "reverse"
}
```

### 响应 data —— 反问环节回应（phase=reverse 中）

```jsonc
{
  "finished": false,
  "nextQuestion": "团队目前 12 个人，分前端组和平台组……你还有什么想了解的吗？",
  "round": 20,
  "phase": "reverse"
}
```

### 响应 data —— 面试已结束（finished=true）

反问结束（候选人明说没有问题 / 反问达 3 个上限）后自动完成：

```jsonc
{
  "finished": true,
  "endedReason": "completed",
  "phase": "reverse",
  "farewell": "好的，感谢你今天的分享，期待后续的合作。祝求职顺利！"
  // 注意：finished 时没有 nextQuestion；报告请调 GET /report
}
```

> `farewell` 为面试官的最后告别语：反问环节自然收尾与候选人主动终止
> （`endedReason=user_finish`，此时 `phase` 仍为 `main`）两种收尾都会返回。
> SSE 流式变体会在报告生成**开始前**先以 `closing` 事件推送该文本，
> 避免长等待期间界面无反馈。
>
> 报告生成失败（HTTP 5xx）时对话不会被回退：直接重发同一请求即可，
> 服务端只补生成报告，不会把这条回答/反问重复写进对话记录。

### 可能的错误

| code | message 示例 |
|------|--------------|
| 409 | `该面试会话已结束` / `面试会话因长时间无回复已自动结束，请重新发起面试` |

---

## 5. 提交回答（SSE 流式变体）

与接口 4 的核心逻辑完全一致，仅传输方式不同：以 Server-Sent Events 依次推送事件，先反馈后下一题，前端可先渲染点评再等待新问题。

- **URL**: `POST /interview/sessions/:id/answers/stream`
- **请求体**: 同接口 4
- **响应格式**: `text/event-stream`

### SSE 事件帧协议

每帧格式为 `data: <JSON>\n\n`，JSON 结构：

| type | 时机 | data 内容 |
|------|------|-----------|
| `init` | 订阅建立后立即推送一次 | 无 |
| `feedback` | 逐题反馈生成完成（主体考察阶段） | `{ completeness, logic, depth, comment }` |
| `closing` | 反问收尾：面试官告别语生成完成（评价报告开始生成**之前**） | `{ farewell, round, phase }` |
| `question` | 下一题/收尾语/反问回应生成完成且面试继续 | `{ finished:false, feedback?, nextQuestion, round, phase, ... }` |
| `finished` | 面试结束（反问环节收尾完成、报告已生成） | `{ finished:true, endedReason, phase, farewell? }` |
| `error` | 服务端处理失败 | `{ message }`（业务异常原文；内部错误为通用文案，不泄漏细节），随后连接关闭 |

```text
data: {"type":"init","message":"开始处理回答"}

data: {"type":"feedback","data":{"completeness":70,"logic":85,"depth":55,"comment":"讲清了方案，缺少量化数据"}}

data: {"type":"question","data":{"finished":false,"nextQuestion":"重构后 QPS 提升了多少？","round":3,"phase":"main","elapsedMinutes":18,"askedCount":3}}

data: {"type":"closing","data":{"farewell":"好的，感谢你今天的分享……留几分钟给你，你有什么想问我的吗？","round":18,"phase":"reverse"}}

data: {"type":"finished","data":{"finished":true,"endedReason":"completed","phase":"reverse","farewell":"好的，感谢你今天的分享……"}}
```

> 反问收尾时服务端会**先推 `closing` 帧再生成报告**：报告基于长转录 + 思考模式生成，通常需要 1~4 分钟（失败自动重试一次），前端应展示告别语并进入等待态。`closing` 帧之后流继续保持，直到 `finished` 帧到达。
>
> 业务性错误（409 已结束/已超时、400 等）在**建连前**抛出，此时响应是标准 JSON 错误包络而非 SSE——前端需按响应 Content-Type 区分处理。客户端断开会自动取消订阅。

---

## 6. 获取反问环节推荐话术

按面试轮次（面试官角色）、模式、JD 与已聊内容，生成 3~5 条可直接使用的反问策略与话术。**面试进行中与结束后均可调用**（结束后用于复盘学习）。

- **URL**: `GET /interview/sessions/:id/reverse-suggestions`
- **参数**: `id` — 会话 ID（路径参数）

### 响应 data

```jsonc
{
  "suggestions": [
    {
      "title": "团队技术栈演进",                        // 主题标签，≤15字
      "content": "想了解一下团队现在核心的技术栈是什么，未来一年有什么演进方向？", // 完整话术，可直接使用
      "rationale": "贴合直属 Leader 视角，展现技术热情"   // 为什么适合现在问
    }
    // 3~5 条
  ]
}
```

### 错误

| code | message |
|------|---------|
| 404 | `面试会话不存在` |

---

## 7. 用户主动收尾（生成报告）

任意阶段（主体考察/反问环节）提前结束面试并**立即基于已有问答生成评价报告**。至少应有 1 轮问答，否则报告质量无法保证。

- **URL**: `POST /interview/sessions/:id/finish`
- **请求体**: 无

### 响应 data

InterviewSession（status=`completed`，endedReason=`user_finish`，report 已填充）。耗时较长（AI 生成报告），前端做好 loading。

---

## 8. 强制中断面试

立即关闭会话，**不调用 AI、不生成报告**，同时释放单会话名额。适用于用户直接放弃面试的场景。

- **URL**: `POST /interview/sessions/:id/cancel`
- **请求体**: 无
- **响应 data**: InterviewSession（status=`cancelled`，endedReason=`user_cancel`）

> finish 与 cancel 的语义区分：**finish = 正常交卷出成绩单；cancel = 弃考**。请按用户意图选择。

---

## 9. 获取评价报告

- **URL**: `GET /interview/sessions/:id/report`
- **参数**: `id` — 会话 ID（路径参数）

### 响应 data（Report）

```jsonc
{
  "overallScore": 78,                  // 总分 0-100
  "summary": "整体表现良好，与岗位要求匹配度较高……", // 总评，≤300字
  "recommendation": "推荐",            // 强烈推荐/推荐/待定/不推荐
  "dimensionScores": {                 // 三维度总评（与逐题反馈同口径）
    "completeness": 75,
    "logic": 80,
    "depth": 70
  },
  "topics": [                          // 逐主题评分（仅覆盖实际考察到的主题）
    {
      "topicKey": "order_system_refactor",
      "title": "订单系统重构",
      "score": 82,
      "comment": "原理讲解清晰，缺少量化数据支撑。"
    }
  ],
  "reverseFeedback": {                 // 反问环节表现评价（未发生反问时省略）
    "score": 85,
    "comment": "反问展现了思考深度与对岗位的热情。"
  },
  "strengths": ["项目深挖对答如流，量化意识强"],
  "weaknesses": ["八股基础个别概念表述模糊"],
  "suggestions": ["深入学习 Node.js 性能剖析工具"]
}
```

> `dimensionScores` 与 `reverseFeedback` 为新增字段；历史会话的报告中可能缺失，前端需做兼容。项目深挖主题（questionType=project）在总分中权重更高。

### 错误

| code | message |
|------|---------|
| 400 | `该面试尚未生成评价报告` |

---

## 10. 获取面试记录列表

分页返回当前用户的历史面试会话（按开始时间倒序）。列表项为会话摘要，**不含 `messages` 对话历史与 `report` 报告正文**，以 `hasReport` 标记报告是否已生成；需要详情时再调接口 3 / 接口 9。

- **URL**: `GET /interview/sessions`

### 查询参数（Query）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | int | 否 | 页码，默认 `1` |
| `pageSize` | int | 否 | 每页数量，默认 `10`，最大 `50` |
| `status` | string | 否 | 状态筛选：`in_progress` / `completed` / `cancelled`，不传返回全部 |

### 响应 data

```jsonc
{
  "list": [
    {
      "_id": "66f0...",
      "resumeId": "66e0...",
      "jobDescription": "前端开发工程师（Node.js 方向）……",
      "levelConfig": { "mode": "experienced", "stage": "second", "experienceLevel": "senior" },
      "status": "completed",
      "phase": "reverse",
      "outline": [{ "key": "order_system_refactor", "title": "订单系统重构", "questionType": "project" }],
      "currentRound": 20,
      "askedTopicKeys": ["self_intro", "order_system_refactor"],
      "hasReport": true,          // 是否已生成报告（status=completed 即为 true）
      "lastActivityAt": "2026-08-25T12:00:00.000Z",
      "startedAt": "2026-08-25T11:20:00.000Z",
      "endedAt": "2026-08-25T12:25:00.000Z",
      "endedReason": "completed",
      "createdAt": "2026-08-25T11:20:00.000Z",
      "updatedAt": "2026-08-25T12:25:00.000Z"
    }
  ],
  "total": 12,
  "page": 1,
  "pageSize": 10
}
```

> 历史会话（旧版本创建）的 `levelConfig` 可能仍是 `focus` 结构、且可能带 `targetRounds`，前端按未知字段兜底。

### 错误

| code | message |
|------|---------|
| 400 | `page 必须是整数` / `pageSize 最大为 50` / `status 必须是 in_progress/completed/cancelled 之一` |

---

## 11. 获取面试官问题语音（TTS）

`GET /interview/sessions/:id/tts?round=N`

按轮次取回该轮面试官发言文本（含反问环节的面试官回应），经 MiMo TTS 合成为语音后以 **wav 二进制流**直接返回（不走统一响应包络）。按会话归属校验权限；会话已结束（回放）同样可用。

**服务端缓存**：合成结果按 `sessionId + round` 落库缓存 **30 天**（`interview_tts_cache` 集合，TTL 自动回收）。命中缓存的点播不再调用 MiMo 合成，不产生费用；过期后重新点播会重新合成一次。浏览器侧仍建议按 `max-age` 缓存以省一次请求。

### 查询参数（Query）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `round` | number | 是 | 发言轮次（从 1 开始），须对应一条面试官消息 |

### 响应

- `Content-Type: audio/wav`，响应体为音频字节
- `Cache-Control: private, max-age=86400`（同会话同轮次音频内容不变，浏览器可缓存）
- 鉴权失败 / 参数非法仍按统一 JSON 错误包络返回

### 前端建议用法

1. 收到新问题（`question` 帧 `data.round`）后请求该接口，取回 `Blob` 经 `URL.createObjectURL` 交给 `Audio` 播放；与打字机动画并行，互不阻塞
2. 前端按 `sessionId:round` 缓存 objectURL，喇叭图标重播时直接命中缓存
3. `autoplay` 依赖用户与页面的既有交互（提交回答的点击已满足），自动播放失败时静默降级为手动点击播放
4. 迁移到 11.1 流式接口后，此 blob/objectURL 播放通道可由流式通道替代（旧接口保留作为降级路径）

### 11.1 流式接口（SSE，边合成边推送）

`GET /interview/sessions/:id/tts/stream?round=N`

与接口 11 同一业务语义（会话归属校验、回放、30 天缓存一致），区别在于音频**边生成边推送**：首帧通常 1~2 秒内到达，前端可立即开始播放，无需等待整题合成完成。

- **响应格式**：`text/event-stream`，每帧 `data: <JSON>\n\n`（消费端需 `fetch` + `ReadableStream` 解析——需携带 `Authorization` 头，`EventSource` 不支持自定义请求头）

| type | 时机 | data |
|------|------|------|
| `meta` | 首帧，流建立后立即推送 | `{ sampleRate, channels }`（PCM16 采样率 / 声道数，采样率以事件为准） |
| `chunk` | 音频数据，多帧 | `{ data }`（base64 编码的 PCM16 小端原始字节） |
| `done` | 合成与推送完成 | 无 |
| `error` | 合成中途失败 | `{ message }`，随后连接关闭 |

```text
data: {"type":"meta","sampleRate":24000,"channels":1}

data: {"type":"chunk","data":"aGVsbG8="}

data: {"type":"done"}
```

- **缓存**：命中 `interview_tts_cache` 时（同会话同轮次）不发上游请求，以相同事件序列快速重放，无费用；未命中才调用 MiMo。缓存规范格式为 **原始 PCM16 + 采样率**（`audio/pcm`）；历史 wav 缓存命中时视作失效，重新合成一次覆盖（惰性迁移）。
- **错误时机**：会话不存在、round 无问题在建连前抛出，返回标准 JSON 错误包络；MiMo 建连与合成**推迟到订阅时**才发生（校验期间客户端断开则不发起任何合成，零费用），建连或合成失败一律以 `error` 事件通知后关闭连接。
- **上游停滞保护**：合成流整体受 10 分钟 deadline 约束，MiMo 中途停发数据时以 `error`（`语音合成响应超时，请稍后重试`）结束，不会永久挂起。
- **生产环境**：经 nginx 依赖 `X-Accel-Buffering: no` 逐帧透传（与 `answers/stream` 相同）。

#### 前端播放建议（Web Audio 增量播放）

1. 收到 `meta` 后创建/复用 `AudioContext`，采样率以 `meta.sampleRate` 为准
2. 每帧 `chunk`：`base64 → Uint8Array → Int16Array → Float32Array(÷32768)` → `AudioBuffer` → `AudioBufferSourceNode.start(nextStartTime)` 链式调度（lookahead 约 0.5~1s），保证无缝衔接
3. `done` 收尾；`error` 提示后可降级到接口 11（完整 blob 播放）
4. 切题 / 离开页面 / 主动停止时停止已调度节点；重播直接重新请求（缓存命中时重放极快，无需前端 objectURL 缓存）
5. `autoplay` 策略不变：依赖用户既有交互，失败时静默降级为手动点击播放

### 错误

| code | message |
|------|---------|
| 400 | `该轮次的问题不存在` / `round 必须是整数` 等 |
| 404 | `面试会话不存在` |
| 500 | `语音合成失败，请稍后重试`（未配置 `MIMO_API_KEY` 或合成过程异常） |
| 502 | `语音服务账户余额不足，请联系管理员充值` / `语音服务未授权，请检查 MIMO_API_KEY 配置` / `语音服务请求过于频繁，请稍后重试` / `语音合成失败：…`（MiMo 上游错误） |

---

## 推荐联调流程

```text
1. POST /sessions                    创建会话（loading："正在准备面试…"）
2. 渲染 session.messages 最后一题     ← 自我介绍开场白（questionType=self_intro）
3. 主体考察循环（phase=main）：
   a. 用户输入回答
   b. POST /answers 或 /answers/stream
   c. 渲染 feedback（三维度评分与点评）
   d. finished=false && phase=main  → 追加 nextQuestion 继续对话
      finished=false && phase=reverse → 进入反问界面（nextQuestion 为收尾引导语）
4. 反问环节循环（phase=reverse）：
   a. 可选：GET /reverse-suggestions 获取推荐话术
   b. 用户输入想问的问题（或"没有问题了"）
   c. POST /answers → 面试官回应（nextQuestion）
   d. finished=true → 跳转报告页（反问上限 3 个自动收尾）
5. 用户随时可：
   - POST /finish    收尾出报告（跳报告页）
   - POST /cancel    放弃面试（回首页）
6. 报告页：GET /report
7. 异常恢复：每次进入面试页先调 GET /sessions/current，
   根据 active / phase / endedReason 判断恢复现场或提示超时
```

### 前端注意事项汇总

1. 创建会话、反问收尾的回答、finish 三类请求耗时较长（AI 生成报告），务必做 loading 与超时兜底
2. `finished=true` 的回答响应中没有 `nextQuestion`，不要渲染空题目
3. 进度展示改为「已进行 X 分钟 / 已提问 N 题」（响应中的 `elapsedMinutes` / `askedCount`），不再有「共 M 轮」
4. `phase=reverse` 时答题框的占位文案应引导用户提问（如「输入你想问面试官的问题」）
5. 收到 409 且 message 含「长时间无回复」时，引导用户重新发起面试
6. 会话详情中的 `expiresAt` 可用于前端倒计时展示剩余作答时间（45 分钟不活动窗口）
7. 所有枚举（模式/轮次/题型/状态/结束原因）以后端为准，前端做未知值的兜底展示；历史会话的旧结构字段（focus/targetRounds）需兼容
