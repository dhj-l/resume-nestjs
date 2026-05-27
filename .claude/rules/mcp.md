---
paths: "mcp/**"
description: "独立的 MCP (Model Context Protocol) 服务，通过 HTTP 调用主 API 并暴露为 MCP 工具"
---

# 模块：mcp

## 职责
独立的 MCP Server 包（`@modelcontextprotocol/sdk`），通过 HTTP 调用 NestJS 主应用的 API，将数据暴露为 MCP 工具（如 `get-resume-records`、`get-user-info`），供 AI 客户端（如 Claude）调用。

## 文件列表
| 文件 | 职责 |
|------|------|
| `src/index.ts` | MCP Server 入口：注册工具、启动 StdioServerTransport |
| `src/api.ts` | HTTP 客户端封装：axios 实例、Bearer Token 认证、统一响应解析 |
| `package.json` | 独立包配置（type: module, tsx 开发运行） |
| `tsconfig.json` | TypeScript 配置（ES2022, ESNext 模块） |

## 依赖关系
- **上游**：AI 客户端（通过 MCP 协议调用）
- **下游**：NestJS 主应用 API（通过 HTTP + Bearer Token）
- **外部**：`@modelcontextprotocol/sdk`（MCP 协议实现）、`axios`（HTTP 客户端）

## 常见修改点
- 新增 MCP 工具：在 `src/index.ts` 中用 `server.registerTool()` 注册，在 `src/api.ts` 中添加对应 HTTP 调用
- 认证 Token 通过环境变量 `TOKEN` 配置，API 地址通过 `SERVER_IP` 配置
- 响应格式与主应用统一响应格式 `{ code, message, data }` 对接
