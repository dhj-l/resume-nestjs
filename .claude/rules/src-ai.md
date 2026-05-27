---
paths: "src/ai/**"
description: "DeepSeek API 的 LangChain 封装层，提供 AI 调用能力"
---

# 模块：src/ai

## 职责
封装 DeepSeek API（通过 LangChain），为上层模块（resume-ai）提供统一的 AI 调用接口。本模块是项目中唯一直接调用外部 AI 服务的地方。

## 文件列表
| 文件 | 职责 |
|------|------|
| `ai.module.ts` | 模块定义：注册 AiService 并导出 |
| `ai.service.ts` | AI 服务：LangChain + DeepSeek 集成，提供简历生成/分析方法 |
| `ai.controller.ts` | AI 控制器（HTTP 端点） |
| `type.ts` | 类型定义 |

## 依赖关系
- **上游**：`ResumeAiModule`（唯一调用方）
- **下游**：无（不依赖其他业务模块）
- **外部**：DeepSeek API（通过 LangChain SDK）

## 常见修改点
- 更换 AI 模型：修改 `ai.service.ts` 中的 LangChain 配置
- 新增 AI 能力：在 `ai.service.ts` 中添加方法，在 `ai.controller.ts` 中暴露端点
- Prompt 调整：修改 `ai.service.ts` 中的 prompt 模板
