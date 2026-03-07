# Vercel 部署指南

本指南将帮助您将 AI 简历系统部署到 Vercel 平台。

## 📋 前置准备

### 1. 准备工作

在开始部署之前，请确保您已完成以下准备工作：

- ✅ 拥有 [GitHub](https://github.com) 账号
- ✅ 拥有 [Vercel](https://vercel.com) 账号
- ✅ 拥有 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) 免费集群
- ✅ 拥有 [DeepSeek API](https://platform.deepseek.com/) 密钥

### 2. 环境变量清单

请准备好以下环境变量的值：

```bash
PORT=3000                                    # 服务器端口
MONGODB_URI=mongodb+srv://...                # MongoDB 连接字符串
JWT_SECRET=your-secure-secret-key           # JWT 密钥（建议使用随机字符串）
DEEPSEEK_API_KEY=sk-your-api-key            # DeepSeek API 密钥
NODE_ENV=production                          # 运行环境
```

---

## 🚀 部署步骤

### 步骤 1：创建 GitHub 仓库

1. 在 GitHub 上创建一个新的仓库
2. 将项目代码推送到仓库

```bash
# 初始化 Git 仓库
git init

# 添加所有文件
git add .

# 提交代码
git commit -m "Initial commit"

# 添加远程仓库（替换为您的仓库地址）
git remote add origin https://github.com/your-username/your-repo.git

# 推送代码
git branch -M main
git push -u origin main
```

### 步骤 2：创建 MongoDB Atlas 数据库

1. 访问 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. 注册/登录账号
3. 创建免费集群（选择 Free Tier）
4. 配置网络访问：
   - 进入 "Network Access"
   - 点击 "Add IP Address"
   - 选择 "Allow Access from Anywhere" (0.0.0.0/0)
5. 创建数据库用户：
   - 进入 "Database Access"
   - 点击 "Add New Database User"
   - 选择 "Password" 认证方式
   - 设置用户名和密码（请记住这些信息）
6. 获取连接字符串：
   - 进入 "Database"
   - 点击 "Connect"
   - 选择 "Connect your application"
   - 复制连接字符串
   - 将 `<password>` 替换为您的数据库密码

**MongoDB 连接字符串示例：**
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/ai-resume?retryWrites=true&w=majority
```

### 步骤 3：获取 DeepSeek API 密钥

1. 访问 [DeepSeek 平台](https://platform.deepseek.com/)
2. 注册/登录账号
3. 进入 API Keys 页面
4. 创建新的 API 密钥
5. 复制 API 密钥（格式：sk-xxxxxxxxxxxxx）

### 步骤 4：在 Vercel 创建项目

1. 访问 [Vercel](https://vercel.com)
2. 使用 GitHub 账号登录
3. 点击 "Add New..." → "Project"
4. 选择您的 GitHub 仓库
5. 点击 "Import"

### 步骤 5：配置 Vercel 项目

#### 构建设置

Vercel 会自动检测到 NestJS 项目，配置如下：

```
Framework Preset: Other
Build Command: pnpm install && pnpm run build
Output Directory: dist
Install Command: pnpm install
```

#### 配置环境变量

在 Vercel 项目设置中添加以下环境变量：

1. 点击项目中的 "Settings" → "Environment Variables"
2. 添加以下变量：

| 名称 | 值 | 说明 |
|------|-----|------|
| `PORT` | `3000` | 服务器端口 |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB 连接字符串 |
| `JWT_SECRET` | `your-secret-key` | JWT 密钥（建议使用 32 位以上随机字符串） |
| `DEEPSEEK_API_KEY` | `sk-your-api-key` | DeepSeek API 密钥 |
| `NODE_ENV` | `production` | 运行环境 |

**重要提示：**
- JWT_SECRET 建议使用随机字符串生成器生成，例如：`openssl rand -base64 32`
- 所有环境变量都应该在 "Production"、"Preview" 和 "Development" 环境中配置

### 步骤 6：部署项目

1. 点击 "Deploy" 按钮
2. 等待构建和部署完成（通常需要 2-5 分钟）
3. 部署成功后，您会获得一个公网 URL，例如：`https://your-project.vercel.app`

### 步骤 7：验证部署

1. 访问您的 Vercel 项目 URL
2. 测试 API 端点：
   ```bash
   # 测试健康检查
   curl https://your-project.vercel.app/api/v1

   # 测试用户注册
   curl -X POST https://your-project.vercel.app/api/v1/user/register \
     -H "Content-Type: application/json" \
     -d '{"username":"test","email":"test@example.com","password":"123456"}'
   ```

---

## ⚠️ 重要注意事项

### 1. 文件上传功能限制

**Vercel 是无服务器平台，不支持本地文件持久化存储。**

当前项目的文件上传功能会受到影响，因为：
- Vercel 的文件系统是只读的
- 上传的文件在函数执行结束后会被删除
- 无法持久化保存上传的文件

**解决方案：**

#### 方案 A：使用对象存储服务（推荐）

1. **阿里云 OSS**
   - 注册阿里云账号
   - 创建 OSS 存储桶
   - 获取 AccessKey 和 SecretKey
   - 安装 SDK：`pnpm add ali-oss`
   - 修改上传逻辑，将文件上传到 OSS

2. **腾讯云 COS**
   - 注册腾讯云账号
   - 创建 COS 存储桶
   - 获取 SecretId 和 SecretKey
   - 安装 SDK：`pnpm add cos-nodejs-sdk-v5`
   - 修改上传逻辑

3. **AWS S3**
   - 注册 AWS 账号
   - 创建 S3 存储桶
   - 获取 Access Key 和 Secret Key
   - 安装 SDK：`pnpm add @aws-sdk/client-s3`
   - 修改上传逻辑

#### 方案 B：禁用文件上传功能

如果暂时不需要文件上传功能，可以：
- 在前端移除文件上传相关功能
- 只使用文本输入方式

### 2. 执行时间限制

Vercel 免费版有执行时间限制：
- Hobby（免费）：最多 10 秒
- Pro：最多 60 秒

如果您的 API 响应时间超过限制，需要：
- 优化代码性能
- 升级到 Pro 版本
- 考虑使用其他平台（如 Railway）

### 3. 冷启动问题

Vercel 无服务器函数有冷启动延迟（通常 1-3 秒），这是正常现象。

---

## 🔧 故障排除

### 问题 1：部署失败 - 构建错误

**错误信息：** `Build failed with error`

**解决方案：**
1. 检查 `package.json` 中的构建脚本是否正确
2. 确保所有依赖都已正确安装
3. 查看 Vercel 构建日志，找到具体错误信息
4. 在本地运行 `pnpm run build` 确保构建成功

### 问题 2：部署成功但 API 无法访问

**错误信息：** `502 Bad Gateway` 或 `404 Not Found`

**解决方案：**
1. 检查 `vercel.json` 配置是否正确
2. 确认 `src/api/index.ts` 文件存在
3. 检查路由配置是否正确
4. 查看 Vercel 函数日志

### 问题 3：数据库连接失败

**错误信息：** `MongoServerError: bad auth`

**解决方案：**
1. 检查 MongoDB 连接字符串是否正确
2. 确认数据库用户名和密码正确
3. 确认 MongoDB 集群允许来自 Vercel 的 IP 访问
4. 检查环境变量是否正确配置

### 问题 4：DeepSeek API 调用失败

**错误信息：** `Authentication failed`

**解决方案：**
1. 检查 DEEPSEEK_API_KEY 是否正确
2. 确认 API 密钥是否有效且未过期
3. 检查 API 密钥是否有足够的配额

### 问题 5：CORS 错误

**错误信息：** `Access to XMLHttpRequest at '...' has been blocked by CORS policy`

**解决方案：**
1. 确认 `main.ts` 中已启用 CORS（已配置）
2. 检查前端请求的域名是否正确
3. 在 Vercel 项目设置中配置允许的域名

---

## 📊 监控和日志

### 查看日志

1. 进入 Vercel 项目
2. 点击 "Deployments"
3. 选择部署记录
4. 点击 "View Function Logs"
5. 查看实时日志

### 性能监控

Vercel 提供内置的性能监控：
- 响应时间
- 错误率
- 函数执行时间
- 带宽使用

---

## 🔄 自动部署

配置完成后，每次您推送代码到 GitHub，Vercel 会自动部署：

```bash
# 修改代码后
git add .
git commit -m "Update code"
git push
```

Vercel 会自动：
1. 检测到新的提交
2. 触发构建
3. 部署新版本
4. 更新域名指向新版本

---

## 💰 成本估算

### Vercel 免费额度

- **Hobby（免费）**
  - 100GB 带宽/月
  - 6,000 分钟函数执行时间/月
  - 无限项目
  - 自动 HTTPS
  - 全球 CDN

### 何时需要升级

如果遇到以下情况，建议升级到 Pro 版本：
- 超过免费带宽限制
- 函数执行时间超过 10 秒
- 需要更快的冷启动速度
- 需要优先支持

**Pro 版本：$20/月**
- 1TB 带宽/月
- 100,000 分钟函数执行时间/月
- 60 秒函数执行时间限制

---

## 🎯 最佳实践

### 1. 环境变量管理

- 不要将敏感信息提交到代码仓库
- 使用强密码和随机密钥
- 定期轮换 API 密钥
- 为不同环境使用不同的配置

### 2. 代码优化

- 减少函数执行时间
- 优化数据库查询
- 使用缓存减少重复计算
- 压缩响应数据

### 3. 错误处理

- 实施全面的错误处理
- 记录详细的错误日志
- 设置告警通知
- 定期监控应用状态

### 4. 安全措施

- 始终使用 HTTPS
- 实施速率限制
- 验证所有输入
- 使用 JWT 认证
- 定期更新依赖

---

## 📞 获取帮助

如果遇到问题：

1. 查看 [Vercel 文档](https://vercel.com/docs)
2. 查看 [NestJS 文档](https://docs.nestjs.com)
3. 查看 [MongoDB 文档](https://docs.mongodb.com)
4. 在项目仓库提交 Issue

---

## ✅ 部署检查清单

部署完成后，请检查以下项目：

- [ ] 项目成功部署到 Vercel
- [ ] 可以通过公网 URL 访问 API
- [ ] MongoDB 数据库连接正常
- [ ] 用户注册和登录功能正常
- [ ] JWT 认证功能正常
- [ ] DeepSeek API 调用正常
- [ ] 环境变量配置正确
- [ ] 日志记录正常
- [ ] 错误处理正常

---

## 🎉 恭喜！

您的 AI 简历系统已成功部署到 Vercel！现在您可以通过互联网访问您的应用了。

**下一步：**
- 配置自定义域名（可选）
- 设置监控和告警
- 优化应用性能
- 添加更多功能

祝您使用愉快！🚀
