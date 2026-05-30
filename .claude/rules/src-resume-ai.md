---
paths: "src/resume-ai/**"
description: "AI 简历核心模块：简历分析、优化生成、编辑记录、AI 用量追踪"
---

# 模块：src/resume-ai

## 职责
AI 简历功能的核心模块，包括简历内容分析评分、AI 优化生成（SSE 流式）、编辑历史记录、AI 调用用量追踪。依赖 AiModule 获取 AI 能力，依赖 DocumentParserService 解析上传的简历文件。

## 文件列表
| 文件 | 职责 |
|------|------|
| `resume-ai.module.ts` | 模块定义：注册 5 个 Schema，导入 AiModule，导出 DocumentParserService 和 Schema |
| `resume-ai.controller.ts` | AI 简历 REST + SSE 端点（分析、生成、记录查询） |
| `resume-ai.service.ts` | 核心业务：简历校验评分、AI 生成/优化、记录管理 |
| `resume-ai.service.spec.ts` | 单元测试：validateResumeContent 方法的详细测试 |
| `document-parser.service.ts` | 文档解析：PDF/DOCX 文件内容提取 |
| `entities/resume-ai.entity.ts` | AI 简历 Mongoose Schema |
| `entities/resume-edit-record.entity.ts` | 简历编辑记录 Schema |
| `entities/resume-analysis-record.entity.ts` | 简历分析记录 Schema |
| `entities/ai-usage-record.entity.ts` | AI 用量追踪 Schema（成本核算） |
| `dto/analyze-resume.dto.ts` | 分析请求 DTO |
| `dto/createAiResuem.dto.ts` | 创建 AI 简历 DTO |
| `dto/get-analysis-detail.dto.ts` | 分析详情查询 DTO |
| `dto/get-latest-analysis.dto.ts` | 最新分析查询 DTO |
| `constants/job-validation.constants.ts` | 职位校验常量 |
| `constants/resume-validation.constants.ts` | 简历校验常量 |
| `types/` | 类型定义 |
| `prompt/` | AI Prompt 模板 |

## 依赖关系
- **上游**：`ResumeModule`、`UploadModule`、前端直接调用
- **下游**：`AiModule`（AI 调用）、`DocumentParserService`（文件解析）
- **外部**：mammoth（DOCX 解析）、pdf-parse（PDF 解析）

## 常见修改点
- 简历校验规则调整：修改 `resume-ai.service.ts` 中的 `validateResumeContent` 方法 + 常量文件
- 新增 AI 功能：在 `resume-ai.service.ts` 添加方法，在 `resume-ai.controller.ts` 暴露端点
- Prompt 优化：修改 `prompt/` 目录下的模板
- 用量统计逻辑：修改 `entities/ai-usage-record.entity.ts` + `resume-ai.service.ts` 中的记录逻辑
