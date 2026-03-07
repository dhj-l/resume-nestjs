# AI 简历系统部署指南

本文档提供了将 AI 简历系统部署到公网环境的多种方案。

## 目录

- [前置要求](#前置要求)
- [环境变量配置](#环境变量配置)
- [部署方案](#部署方案)
  - [方案一：Vercel 部署（推荐）](#方案一vercel-部署推荐)
  - [方案二：Railway 部署](#方案二railway-部署)
  - [方案三：Docker + 云服务器部署](#方案三docker--云服务器部署)
  - [方案四：Render 部署](#方案四render-部署)
- [数据库配置](#数据库配置)
- [常见问题](#常见问题)

---

## 前置要求

1. **Node.js** 版本 >= 18.0.0
2. **pnpm** 包管理器
3. **MongoDB** 数据库（云服务或自建）
4. **DeepSeek API** 密钥

---

## 环境变量配置

在部署前，请确保配置以下环境变量：

```bash
# 服务器端口（默认 3000）
PORT=3000

# MongoDB 数据库连接字符串
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ai-resume

# JWT 密钥（请使用强密码）
JWT_SECRET=your-very-secure-jwt-secret-key

# DeepSeek API 密钥
DEEPSEEK_API_KEY=sk-your-deepseek-api-key

# 运行环境
NODE_ENV=production
```

---

## 部署方案

### 方案一：Vercel 部署（推荐）

Vercel 是一个现代化的部署平台，支持自动部署和全球 CDN。

#### 步骤：

1. **准备代码仓库**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/your-username/your-repo.git
   git push -u origin main
   ```

2. **在 Vercel 创建项目**
   - 访问 [vercel.com](https://vercel.com)
   - 点击 "New Project"
   - 导入你的 GitHub 仓库
   - 选择 "NestJS" 框架（如果没有，选择 "Other"）

3. **配置环境变量**
   在 Vercel 项目设置中添加以下环境变量：
   ```
   PORT=3000
   MONGODB_URI=your-mongodb-uri
   JWT_SECRET=your-jwt-secret
   DEEPSEEK_API_KEY=your-deepseek-api-key
   NODE_ENV=production
   ```

4. **部署**
   - 点击 "Deploy" 按钮
   - 等待部署完成（通常 2-5 分钟）
   - 部署成功后，你会获得一个公网 URL

5. **自定义域名（可选）**
   - 在项目设置中添加自定义域名
   - 配置 DNS 记录指向 Vercel

#### 优点：
- ✅ 免费额度充足
- ✅ 自动 HTTPS
- ✅ 全球 CDN 加速
- ✅ 自动部署（Git 推送触发）
- ✅ 无需服务器维护

#### 缺点：
- ❌ 无服务器限制（执行时间、内存）
- ❌ 文件上传功能受限

---

### 方案二：Railway 部署

Railway 提供完整的容器化部署支持，适合需要持久化存储的应用。

#### 步骤：

1. **创建 Railway 账号**
   - 访问 [railway.app](https://railway.app)
   - 使用 GitHub 账号登录

2. **创建新项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 选择你的仓库

3. **配置 MongoDB**
   - 在项目中添加 "MongoDB" 插件
   - Railway 会自动创建 MongoDB 实例
   - 复制生成的 MongoDB URI

4. **配置环境变量**
   在项目设置中添加环境变量：
   ```
   PORT=3000
   MONGODB_URI=railway-mongodb-uri
   JWT_SECRET=your-jwt-secret
   DEEPSEEK_API_KEY=your-deepseek-api-key
   NODE_ENV=production
   ```

5. **部署**
   - Railway 会自动检测并部署
   - 部署完成后获得公网 URL

#### 优点：
- ✅ 支持持久化存储
- ✅ 完整的容器环境
- ✅ 内置数据库支持
- ✅ 简单易用

#### 缺点：
- ❌ 免费额度有限
- ❌ 部署速度较慢

---

### 方案三：Docker + 云服务器部署

使用 Docker 容器化部署到云服务器（如阿里云、腾讯云、AWS 等）。

#### 步骤：

1. **准备云服务器**
   - 购买云服务器（推荐 2 核 4GB 配置）
   - 安装 Docker 和 Docker Compose
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```

2. **创建 docker-compose.yml**
   ```yaml
   version: '3.8'
   
   services:
     app:
       build: .
       ports:
         - "3000:3000"
       environment:
         - PORT=3000
         - MONGODB_URI=mongodb://mongodb:27017/ai-resume
         - JWT_SECRET=your-jwt-secret
         - DEEPSEEK_API_KEY=your-deepseek-api-key
         - NODE_ENV=production
       depends_on:
         - mongodb
       restart: always
   
     mongodb:
       image: mongo:7
       ports:
         - "27017:27017"
       volumes:
         - mongodb_data:/data/db
       restart: always
   
   volumes:
     mongodb_data:
   ```

3. **构建并启动**
   ```bash
   # 上传代码到服务器
   scp -r . user@server-ip:/app
   
   # SSH 连接到服务器
   ssh user@server-ip
   cd /app
   
   # 启动服务
   docker-compose up -d
   ```

4. **配置 Nginx 反向代理（可选）**
   ```nginx
   server {
       listen 80;
       server_name your-domain.com;
   
       location / {
           proxy_pass http://localhost:3000;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

5. **配置 SSL 证书（可选）**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d your-domain.com
   ```

#### 优点：
- ✅ 完全控制服务器
- ✅ 无平台限制
- ✅ 性能可扩展
- ✅ 成本可控

#### 缺点：
- ❌ 需要服务器维护
- ❌ 需要手动配置 HTTPS
- ❌ 需要运维知识

---

### 方案四：Render 部署

Render 是一个现代化的云平台，支持多种部署方式。

#### 步骤：

1. **创建 Render 账号**
   - 访问 [render.com](https://render.com)
   - 使用 GitHub 账号登录

2. **创建 Web Service**
   - 点击 "New +"
   - 选择 "Web Service"
   - 连接 GitHub 仓库

3. **配置构建和启动**
   ```
   Build Command: pnpm install && pnpm run build
   Start Command: npm run start:prod
   ```

4. **配置环境变量**
   ```
   PORT=3000
   MONGODB_URI=your-mongodb-uri
   JWT_SECRET=your-jwt-secret
   DEEPSEEK_API_KEY=your-deepseek-api-key
   NODE_ENV=production
   ```

5. **部署**
   - 点击 "Create Web Service"
   - 等待部署完成

#### 优点：
- ✅ 免费额度
- ✅ 自动 HTTPS
- ✅ 简单易用
- ✅ 支持数据库

#### 缺点：
- ❌ 冷启动延迟
- ❌ 免费版有休眠限制

---

## 数据库配置

### MongoDB Atlas（推荐）

1. **创建免费集群**
   - 访问 [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
   - 创建免费账号
   - 创建免费集群（512MB 存储）

2. **配置网络访问**
   - 在 "Network Access" 中添加 IP 地址
   - 选择 "Allow Access from Anywhere"（0.0.0.0/0）

3. **获取连接字符串**
   - 在 "Database" 中点击 "Connect"
   - 选择 "Connect your application"
   - 复制连接字符串

4. **配置用户**
   - 在 "Database Access" 中创建数据库用户
   - 记住用户名和密码

### 其他 MongoDB 选项

- **MongoDB Compass**：本地开发使用
- **Docker MongoDB**：快速启动本地实例
- **云服务商 MongoDB**：阿里云、腾讯云等

---

## 常见问题

### 1. 部署后无法连接数据库

**解决方案：**
- 检查 MongoDB URI 是否正确
- 确认数据库允许来自部署平台的 IP 访问
- 检查数据库用户权限

### 2. 文件上传功能不工作

**解决方案：**
- Vercel 等无服务器平台不支持持久化文件存储
- 建议使用对象存储服务（如 AWS S3、阿里云 OSS）
- 或选择支持持久化存储的平台（Railway、Docker）

### 3. API 响应慢

**解决方案：**
- 检查 DeepSeek API 响应时间
- 考虑使用 CDN 加速静态资源
- 优化数据库查询
- 增加服务器配置

### 4. CORS 错误

**解决方案：**
- 确保后端已启用 CORS（已在 main.ts 中配置）
- 检查前端请求的域名是否在允许列表中
- 使用代理服务器解决跨域问题

### 5. 内存不足

**解决方案：**
- 升级服务器配置
- 优化代码内存使用
- 使用流式处理大文件
- 增加 Node.js 内存限制：`NODE_OPTIONS=--max-old-space-size=4096`

---

## 监控和日志

### Vercel 监控
- 访问 Vercel 项目仪表板
- 查看 "Logs" 和 "Analytics"

### Railway 监控
- 查看 Railway 项目日志
- 使用内置的监控工具

### Docker 监控
```bash
# 查看容器日志
docker-compose logs -f

# 查看容器资源使用
docker stats

# 重启服务
docker-compose restart
```

---

## 成本估算

| 平台 | 免费额度 | 推荐套餐 | 月成本 |
|------|---------|---------|--------|
| Vercel | 100GB 带宽 | Pro | $20 |
| Railway | $5 免费额度 | Standard | $20 |
| Render | 750 小时/月 | Standard | $7 |
| 阿里云 ECS | - | 2核4GB | ¥50-100 |
| 腾讯云 CVM | - | 2核4GB | ¥50-100 |

---

## 安全建议

1. **环境变量**
   - 不要将敏感信息提交到代码仓库
   - 使用强密码和随机密钥
   - 定期轮换 API 密钥

2. **HTTPS**
   - 始终使用 HTTPS
   - 配置 SSL 证书
   - 强制重定向到 HTTPS

3. **数据库**
   - 使用强密码
   - 限制 IP 访问
   - 定期备份数据

4. **API 安全**
   - 实施速率限制
   - 验证所有输入
   - 使用 JWT 认证

---

## 总结

推荐部署方案：

1. **快速原型**：使用 Vercel（免费且快速）
2. **生产环境**：使用 Railway 或 Docker + 云服务器
3. **高可用性**：使用 Docker + 负载均衡 + 多实例

选择适合你需求和预算的方案，按照上述步骤进行部署即可。

如有问题，请查看项目的 [README.md](README.md) 或提交 Issue。
