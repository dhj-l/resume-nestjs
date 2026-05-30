---
name: ai-self-describing-architecture-update-workflow
description: 当项目文件结构变化时更新 AI 自描述架构（CLAUDE.md + .claude/rules/）的标准流程
type: feedback
---

当项目结构发生变化或需要调整现有描述时，按以下流程更新 AI 自描述架构：

1. 根据变更的文件路径，匹配 `.claude/rules/` 下各规则文件的 `paths` 字段，识别受影响的规则文件
2. 更新对应规则文件中的内容（职责、文件列表、依赖关系、常见修改点）
3. 如果变更涉及项目整体架构（新增/删除模块、模块间依赖关系变化、全局管线变更），同步更新根目录 `CLAUDE.md` 中的对应章节

**Why:** 用户已建立了分层规则体系（CLAUDE.md 为总览，.claude/rules/*.md 为按目录的详细规则），需要保持两者同步。

**How to apply:** 每次代码变更涉及新文件创建、模块重组、依赖变化时，主动检查并更新规则文件。修改完成后向用户简要报告更新了哪些文件。
