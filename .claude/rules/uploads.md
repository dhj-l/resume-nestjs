---
paths: "uploads/**"
description: "用户上传文件的磁盘存储目录，通过 /uploads/ 路径静态托管"
---

# 模块：uploads

## 职责
Multer 磁盘存储目标目录，存放用户上传的图片（PNG/JPG/WEBP）、PDF、DOC/DOCX 文件。通过 NestJS 静态资源服务以 `/uploads/` 路径对外访问。

## 文件列表
| 文件 | 职责 |
|------|------|
| `*.png` / `*.jpg` / `*.webp` | 用户上传的图片文件（时间戳+随机数命名） |
| `*.pdf` | 用户上传的 PDF 简历文件 |
| `placeholder.png` | 默认占位图片 |

## 依赖关系
- **上游**：`src/common/upload/`（Multer 写入）、前端（通过 `/uploads/` URL 读取）
- **下游**：无
- **外部**：无

## 常见修改点
- 此目录由系统自动管理，通常不需要手动修改
- 部署到无服务器平台（Vercel）时需改用对象存储（S3/OSS），因为无服务器平台不支持持久化文件存储
- 清理过期文件时需要遍历此目录
