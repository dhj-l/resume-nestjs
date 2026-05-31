#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# AI 简历系统 — Ubuntu 一键部署脚本
# 适用: Ubuntu 22.04 / 24.04 LTS
# ═══════════════════════════════════════════════════════════════
set -euo pipefail

APP_DIR="/opt/ai-resume"
APP_USER="www-data"
NODE_VERSION="20"

# ─── 颜色 ───
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── 1. 检查是否为 root ───
if [[ $EUID -ne 0 ]]; then
  echo "请使用 root 用户运行: sudo bash deploy.sh"
  exit 1
fi

log "开始部署 AI 简历系统..."

# ─── 2. 更新系统 ───
log "更新系统包..."
apt update -qq && apt upgrade -y -qq

# ─── 3. 安装 Node.js 20.x ───
if ! command -v node &>/dev/null; then
  log "安装 Node.js ${NODE_VERSION}..."
  curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
  apt install -y nodejs
  log "Node.js $(node -v)"
else
  log "Node.js 已安装: $(node -v)"
fi

# ─── 4. 安装 pnpm ───
if ! command -v pnpm &>/dev/null; then
  log "安装 pnpm..."
  npm install -g pnpm
  log "pnpm $(pnpm -v)"
else
  log "pnpm 已安装: $(pnpm -v)"
fi

# ─── 5. 安装 MongoDB 7 ───
if ! command -v mongod &>/dev/null; then
  log "安装 MongoDB 7..."
  curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
  echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    > /etc/apt/sources.list.d/mongodb-org-7.0.list
  apt update -qq
  apt install -y mongodb-org

  systemctl enable mongod
  systemctl start mongod
  log "MongoDB 已安装并启动"
else
  log "MongoDB 已安装: $(mongod --version | head -1)"
fi

# ─── 6. 安装 Nginx + PM2 ───
log "安装 Nginx 和 PM2..."
apt install -y nginx
npm install -g pm2

systemctl enable nginx
systemctl start nginx
log "Nginx 和 PM2 已安装"

# ─── 7. 创建应用目录 ───
log "创建应用目录: ${APP_DIR}"
mkdir -p "${APP_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}"

# ─── 8. 提示上传代码 ───
cat << 'EOF'

╔══════════════════════════════════════════════════════════╗
║  服务器环境已就绪！                                      ║
║                                                          ║
║  接下来请将项目代码上传到服务器:                         ║
║                                                          ║
║  方式一（在本地执行）:                                   ║
║    cd 项目根目录                                         ║
║    rsync -avz --exclude 'node_modules' \                 ║
║      --exclude 'dist' --exclude '.env' \                 ║
║      --exclude 'logs' --exclude 'uploads' \              ║
║      ./ user@服务器IP:/opt/ai-resume/                    ║
║                                                          ║
║  方式二（git clone）:                                    ║
║    git clone <仓库地址> /opt/ai-resume                    ║
║                                                          ║
║  上传完成后，回到服务器运行:                              ║
║    sudo bash /opt/ai-resume/setup-env.sh                 ║
╚══════════════════════════════════════════════════════════╝
EOF

log "第一阶段完成！请按提示上传代码后运行 setup-env.sh"
