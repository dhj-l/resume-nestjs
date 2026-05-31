#!/usr/bin/env bash
set -euo pipefail

GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${GREEN}[+]${NC} $1"; }

log "更新系统包..."
apt update -qq && apt upgrade -y -qq

log "安装 Node.js 20..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
log "Node.js: $(node -v)"

log "安装 pnpm..."
npm install -g pnpm
log "pnpm: $(pnpm -v)"

log "安装 MongoDB 7..."
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
  | gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg
echo "deb [ signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
  > /etc/apt/sources.list.d/mongodb-org-7.0.list
apt update -qq
apt install -y mongodb-org
systemctl enable mongod
systemctl start mongod
log "MongoDB: $(mongod --version | head -1)"

log "安装 Nginx..."
apt install -y nginx
systemctl enable nginx
systemctl start nginx
log "Nginx: $(nginx -v 2>&1)"

log "安装 PM2..."
npm install -g pm2
log "PM2: $(pm2 -v)"

log "全部依赖安装完成！"
