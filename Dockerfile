# syntax=docker/dockerfile:1
# ------------------------------------------------------------------
# NavPage 镜像：多阶段构建
#   deps   → 安装全部依赖（含构建期依赖）
#   build  → 类型检查 + vite 打包，产出 dist/
#   runtime→ 仅保留运行期依赖，单端口同时提供 API 与静态页面
# 构建：docker build -t navpage:latest .
# 运行：docker run -d -p 8787:8787 -v navpage-data:/app/data navpage:latest
# ------------------------------------------------------------------

ARG NODE_IMAGE=node:22-bookworm-slim

# ---------- 1. 依赖 ----------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json .npmrc ./
RUN npm ci --registry=${NPM_REGISTRY} --no-audit --no-fund

# ---------- 2. 构建前端 ----------
FROM deps AS build
WORKDIR /app
COPY index.html tsconfig.json vite.config.ts ./
COPY public ./public
COPY src ./src
RUN npm run build

# ---------- 3. 运行 ----------
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=8787 \
    NAVPAGE_DATA_DIR=/app/data \
    TZ=Asia/Shanghai

WORKDIR /app

# 只装运行期依赖（express），并清理 npm 缓存减小体积
ARG NPM_REGISTRY=https://registry.npmmirror.com
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --registry=${NPM_REGISTRY} --no-audit --no-fund \
    && npm cache clean --force

COPY server ./server
COPY --from=build /app/dist ./dist

# 提前校验当前基础镜像是否内置 node:sqlite，失败时给出可操作的提示
RUN node -e "import('node:sqlite').catch(() => { console.error('当前 Node 镜像未内置 node:sqlite，请通过 --build-arg NODE_IMAGE=node:22-bookworm-slim 指定官方镜像'); process.exit(1) })"

# 数据目录归 node 用户所有，容器以非 root 运行
RUN mkdir -p /app/data && chown -R node:node /app
USER node

EXPOSE 8787
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8787)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
