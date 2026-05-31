#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════
# 环境配置 + 应用启动脚本
# ═══════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/opt/ai-resume"
APP_USER="www-data"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

[[ $EUID -ne 0 ]] && err "请使用 root 运行: sudo bash setup-env.sh"
[[ ! -f "${APP_DIR}/package.json" ]] && err "项目代码未找到，请先上传到 ${APP_DIR}"

cd "${APP_DIR}"

# ─── 1. 交互式配置环境变量 ───
log "配置环境变量..."
if [[ -f .env ]]; then
  warn ".env 文件已存在，跳过创建"
else
  read -rp "JWT_SECRET（留空自动生成 64 位随机字符串）: " jwt_secret
  jwt_secret="${jwt_secret:-$(openssl rand -hex 32)}"

  read -rp "ENCRYPTION_KEY（留空自动生成）: " enc_key
  enc_key="${enc_key:-$(openssl rand -hex 32)}"

  read -rp "DEEPSEEK_API_KEY: " deepseek_key
  [[ -z "$deepseek_key" ]] && err "DEEPSEEK_API_KEY 不能为空"

  read -rp "CORS_ORIGINS（逗号分隔，默认 http://服务器IP 和 localhost:5173）: " cors_origins
  cors_origins="${cors_origins:-http://localhost:5173,http://localhost:5174}"

  cat > .env << ENVEOF
# ── 服务器 ──
PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# ── 数据库 ──
MONGODB_URI=mongodb://127.0.0.1:27017/ai-resume

# ── 安全 ──
JWT_SECRET=${jwt_secret}
ENCRYPTION_KEY=${enc_key}

# ── AI ──
DEEPSEEK_API_KEY=${deepseek_key}

# ── CORS ──
CORS_ORIGINS=${cors_origins}

# ── OAuth（按需配置）──
GITEE_CLIENT_ID=
GITEE_CLIENT_SECRET=
GITEE_REDIRECT_URI=
GITEE_FRONTEND_CALLBACK_URL=

GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
GITHUB_REDIRECT_URI=
GITHUB_FRONTEND_CALLBACK_URL=

QQ_CLIENT_ID=
QQ_CLIENT_SECRET=
QQ_REDIRECT_URI=
QQ_FRONTEND_CALLBACK_URL=
ENVEOF
  chmod 600 .env
  log ".env 文件已创建（权限 600）"
fi

# ─── 2. 安装依赖 ───
log "安装 npm 依赖..."
pnpm install --frozen-lockfile --prod=false

# ─── 3. 构建项目 ───
log "构建项目..."
pnpm build

# ─── 4. 创建必要目录 ───
log "准备运行时目录..."
mkdir -p uploads logs
chown -R "${APP_USER}:${APP_USER}" uploads logs dist

# ─── 5. 配置 Nginx ───
log "配置 Nginx..."
if [[ -f nginx.conf ]]; then
  cp nginx.conf /etc/nginx/sites-available/ai-resume
  ln -sf /etc/nginx/sites-available/ai-resume /etc/nginx/sites-enabled/

  # 移除默认站点（避免冲突）
  rm -f /etc/nginx/sites-enabled/default

  nginx -t && systemctl reload nginx
  log "Nginx 配置已生效"
else
  warn "nginx.conf 未找到，跳过"
fi

# ─── 6. 配置防火墙 ───
log "配置防火墙..."
if command -v ufw &>/dev/null; then
  ufw allow 22/tcp    # SSH
  ufw allow 80/tcp    # HTTP
  ufw allow 443/tcp   # HTTPS
  ufw --force enable
  log "防火墙已配置: 22, 80, 443 端口开放"
fi

# ─── 7. 启动应用 ───
log "启动应用..."

# 先停掉旧实例
pm2 delete ai-resume 2>/dev/null || true

# 启动
pm2 start ecosystem.config.js

# 保存进程列表（开机自启）
pm2 save

# 配置开机自启
pm2 startup systemd -u root --hp /root 2>/dev/null || true

log "等待应用启动..."
sleep 3

# ─── 8. 验证 ───
pm2 status

echo ""
echo "══════════════════════════════════════════════"
echo "  部署完成！"
echo "══════════════════════════════════════════════"
echo ""
echo "  验证命令:"
echo "    curl http://127.0.0.1:3000/api/v1/health"
echo "    curl http://服务器IP/api/v1/health"
echo ""
echo "  查看日志:"
echo "    pm2 logs ai-resume"
echo "    tail -f ${APP_DIR}/logs/app-*.log"
echo ""
echo "  管理命令:"
echo "    pm2 restart ai-resume   # 重启"
echo "    pm2 stop ai-resume      # 停止"
echo "    pm2 status              # 状态"
echo ""
echo "  添加 SSL（有域名后）:"
echo "    sudo apt install certbot python3-certbot-nginx"
echo "    sudo certbot --nginx -d your-domain.com"
echo ""
