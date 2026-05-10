# 缺失业务功能接口分析

## 现有接口清单

### User 模块 (`/api/v1/user`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/user` | 注册 |
| POST | `/user/login` | 登录 |
| GET | `/user/profile` | 当前用户信息 |
| PATCH | `/user/profile` | 更新个人信息 |
| PATCH | `/user/change-password` | 修改密码 |
| GET | `/user` | 用户列表（管理员） |
| GET/DELETE/PATCH | `/user/:id` | 用户 CRUD（管理员） |

### Resume 模块 (`/api/v1/resume`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/resume` | 创建简历（支持模板） |
| GET | `/resume` | 简历列表（分页） |
| GET | `/resume/templates` | 模板简历列表 |
| GET | `/resume/:id` | 简历详情 |
| PATCH | `/resume/:id` | 更新简历 |
| DELETE | `/resume/:id` | 删除简历 |
| POST | `/resume/:id/copy` | 复制简历 |
| POST | `/resume/download` | 下载 PDF |

### ResumeAi 模块 (`/api/v1/resume-ai`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/resume-ai/generate` | AI 生成简历 |
| POST | `/resume-ai/parse` | AI 解析简历 |
| POST | `/resume-ai/generatesse` | SSE 流式生成 |
| GET | `/resume-ai/records` | 生成记录（分页） |

### Template 模块 (`/api/v1/template`)

CRUD 完整，公开列表+详情，需认证创建/修改/删除。

### Upload 模块 (`/api/v1/upload`)

| 方法 | 路径 | 功能 |
|------|------|------|
| POST | `/upload/image` | 上传图片 |
| POST | `/upload/resume` | 上传简历文件并解析 |

### AI 模块 (`/api/v1/ai`)

**空壳**，无任何接口。

---

## 缺失的业务功能接口

### 一、核心业务缺失（高优先级）

**1. AI 模块化单模块重生成**

目前 SSE 模式只能整体生成，无法对单个模块（如只重新生成「项目经历」）进行 AI 重写，缺少独立的单模块调用接口。

**2. AI 简历优化 / 评分建议**

没有"AI 给出简历优化建议"或"简历与 JD 匹配度评分"的接口。目前只有内容校验，但没有返回给用户的可操作优化意见。

**3. 用户角色字段**

`User` 实体中无 `role` 字段，但 `user.controller.ts` 里读取 `req.user.role === 'admin'` 做权限判断——JWT payload 里有 role，但数据库中没有持久化，导致角色信息无法管理。

### 二、业务增强缺失（中优先级）

**4. 简历分享 / 公开链接**

用户无法生成可分享的简历链接（公开只读访问），这对求职场景是常见需求。

**5. 简历历史版本**

没有版本管理，修改后旧版本丢失，无法回退到历史状态。

**6. 模板分类与推荐**

模板列表无按 `category` 筛选的接口，`usedCount` 没有自增逻辑（无人调用时递增），也没有热门模板排序接口。

**7. AI 生成记录详情**

`GET /resume-ai/records` 只返回记录列表，但无法单独查看某条记录的详情（包括生成的简历数据和优化描述）。

**8. AI 生成记录删除**

记录只能查看，无法删除或取消正在进行的生成任务。

### 三、功能补全（低优先级）

**9. 用户头像上传接口**

上传图片返回 URL，但没有专门的接口将头像 URL 保存到用户实体，`User` 中也无 `avatar` 字段。

**10. 简历搜索**

简历列表只支持分页，不支持按标题或内容关键词搜索。

**11. 简历导出其他格式**

目前只支持 PDF，缺少导出 Word/图片等格式的接口。

**12. 用户数据统计仪表盘**

缺少"我的简历数量"、"AI 生成次数"、"本月使用统计"等用户维度的数据聚合接口。

**13. 文件上传通用优化**

`upload/resume` 硬编码了 `http://localhost:3000`，环境变量未生效；文件大小限制未在 Multer 配置中全局声明。
