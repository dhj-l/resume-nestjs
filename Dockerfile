# ═══════════════════════════════════════════════════════════
# 阶段一：构建
# ═══════════════════════════════════════════════════════════
FROM node:20-alpine AS builder

# bcrypt 编译依赖
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm && pnpm install --frozen-lockfile

COPY . .

RUN pnpm run build

# 生产依赖（裁剪 devDependencies）
RUN pnpm install --frozen-lockfile --prod

# ═══════════════════════════════════════════════════════════
# 阶段二：运行
# ═══════════════════════════════════════════════════════════
FROM node:20-alpine

# Chromium 运行依赖（Puppeteer PDF 生成）
# bcrypt 运行时依赖
RUN apk add --no-cache \
  chromium \
  nss \
  freetype \
  harfbuzz \
  ca-certificates \
  ttf-freefont \
  && addgroup -g 1001 appuser \
  && adduser -D -u 1001 -G appuser appuser

# 告诉 Puppeteer 使用系统 Chromium（跳过下载）
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

WORKDIR /app

# 从构建阶段复制产物
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/ecosystem.config.js ./

# 运行时目录
RUN mkdir -p uploads logs && chown -R appuser:appuser uploads logs

USER appuser

EXPOSE 3000

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/api/v1/health || exit 1

CMD ["node", "dist/main"]
