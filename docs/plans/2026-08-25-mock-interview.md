# 模拟面试模块（Mock Interview）实施计划

> **For Claude:** 执行时使用 superpowers:executing-plans 按任务逐个实施。

**目标：** 新增 `src/interview/` 模块，实现基于岗位 JD + 简历的 AI 自适应模拟面试对话，支持多维度面试级别，面试结束后生成评价报告。

**架构决策：**

1. **大纲规划 + 逐题自适应生成**：会话创建时生成考察大纲（主题清单），每轮根据上一轮回答从大纲选择下一个主题并生成具体题目（含追问）。兼顾覆盖面稳定与自适应，token 成本低、首题响应快。
2. **传输层与服务层解耦（为语音扩展预留）**：`InterviewService` 核心方法以纯文本输入输出，不感知 HTTP/SSE/WebSocket；消息实体预留 `channel: 'text' | 'voice'` 字段；SSE 流式接口为未来 TTS 预留；所有 AI 调用经 `src/ai/`。

**会话生命周期：**

- `status`: `in_progress → completed | cancelled`
- `endedReason`: `completed | ai_suggest | user_finish | user_cancel | timeout`
- 结束条件三分支：自然结束（达到 targetRounds）、AI 建议结束（round >= 3 且引擎判定）、用户操作
- `finish`（出报告）/ `cancel`（不出报告）语义分离
- 超时：惰性检查（30 分钟无活动，触点入口校验 expiresAt）+ @nestjs/schedule 定时清扫

**Tech Stack:** NestJS 11、Mongoose、LangChain (@langchain/deepseek)、Zod、RxJS (SSE)、@nestjs/schedule

---

## 数据模型

### InterviewSession

```ts
user: ObjectId(ref User, index), userId: string
resume: ObjectId(ref Resume), resumeId: string
jobDescription: string
levelConfig: LevelConfig            // { experienceLevel, focus }
status: 'in_progress' | 'completed' | 'cancelled'
outline: Mixed                      // [{ key, title, description, difficulty }]
currentRound: number                // 从 1 开始
targetRounds: number
messages: InterviewMessage[]        // 内嵌子文档
report?: Mixed
lastActivityAt: Date
expiresAt: Date                     // 索引
endedReason?: ...
startedAt / endedAt
```

- partial unique index：`{ user: 1 }` where `{ status: 'in_progress' }`，保证单会话
- InterviewMessage 子文档：`role('interviewer'|'candidate'), content, round, kind('question'|'answer'), channel('text'|'voice'), askedAt?`

### 级别维度（constants/level.constants.ts）

- `experienceLevel: junior | mid | senior | expert`
- `focus: technical | project | mixed`
- 各组合映射 targetRounds 与 prompt 描述

## API（/api/v1/interview）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/sessions` | 创建会话 → 大纲 + 首题 |
| GET | `/sessions/current` | 我的进行中会话 |
| GET | `/sessions/:id` | 会话详情 |
| GET | `/sessions/:id/stream/question` | SSE 流式下一题 |
| POST | `/sessions/:id/answers` | 提交回答 → 下一题 / 自动完结 |
| POST | `/sessions/:id/finish` | 正常收尾，出报告 |
| POST | `/sessions/:id/cancel` | 强制中断，不出报告 |
| GET | `/sessions/:id/report` | 获取评价报告 |

## 模块结构

```
src/interview/
├── interview.module.ts / interview.controller.ts / interview.service.ts
├── services/{question-engine,evaluation}.service.ts (+spec)
├── dto/{create-interview-session,submit-answer,finish-interview}.dto.ts
├── entities/{interview-session.entity.ts,level-config.entity.ts}
├── schemas/{interview-outline,interview-question,interview-report}.schema.ts (Zod)
├── prompt/{outline,question,report}.prompt.ts
└── constants/level.constants.ts
```

## src/ai/ 扩展

- `generateInterviewOutline()` — JSON mode，关思考
- `generateInterviewQuestion(mode?)` — 追问决策 low 思考
- `generateInterviewReport()` — JSON mode，思考 medium
- 解析统一走 `createRobustStructuredParser`

## 任务列表（TDD）

1. 实体与常量 + module 骨架注册 app.module
2. DTO 与 Controller 骨架
3. src/ai/ 工厂方法
4. Zod schema 与 Prompt
5. question-engine.service
6. interview.service 编排 + 超时惰性检查
6.5. @nestjs/schedule 定时清扫
7. evaluation.service
8. Controller 完整接线 + SSE
9. 收尾 lint/test/build

## 不做（YAGNI）

语音通话本身、HR/行为面题型、多会话并存、面试官人格自定义。
