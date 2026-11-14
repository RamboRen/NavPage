# NavPage · 干净的个人导航

一个用来替代浏览器默认主页的导航站：把常用网站按分类铺开，搜索默认走广告更克制或直接给答案的引擎，不用再在搜索结果页里翻找真正的官网。

技术栈：**React 19 + TypeScript + Vite 8 + CSS Modules** 前端，**Express 5 + SQLite（Node 内置 node:sqlite，零原生依赖）** 后端。分类、站点、搜索引擎、外观全部存 SQLite，**页面内即可增删改**，不需要动任何源码。

## 快速开始

要求 Node.js ≥ 22.5（使用了内置的 `node:sqlite`）。

```bash
npm install       # 安装依赖（已配置国内镜像 .npmrc）

npm run dev       # 前后端一起启动（concurrently）
                  #   web: http://127.0.0.1:5173（热更新，/api 代理到 8787）
                  #   api: http://127.0.0.1:8787

npm run build     # 类型检查 + 产出 dist/
npm start         # 生产模式：单端口同时提供 API 和静态页面（http://127.0.0.1:8787）
```

数据库文件自动创建在 `data/navpage.db`（可用环境变量 `NAVPAGE_DATA_DIR` 改位置，已加入 .gitignore）。首次启动自动写入出厂分类 / 站点 / 引擎与默认收藏。

## Docker 运行

不装 Node 也能跑，只需要 Docker（桌面版或 Engine + Compose）。

```bash
docker compose up -d --build     # 构建并后台启动，访问 http://localhost:8787
docker compose logs -f           # 看日志
docker compose down              # 停止（数据卷 navpage-data 保留）
docker compose down -v           # 停止并删除数据
```

Linux / macOS / WSL / Git Bash 还可以用封装脚本，自动完成构建、替换旧容器、等待健康检查：

```bash
./docker-run.sh            # 启动（默认 8787）
PORT=8080 ./docker-run.sh  # 换宿主机端口
./docker-run.sh logs       # 跟踪日志
./docker-run.sh stop       # 停止
```

也可以只用原生命令：

```bash
docker build -t navpage:latest .
docker run -d --name navpage -p 8787:8787 -v navpage-data:/app/data navpage:latest
```

镜像说明：

- **多阶段构建**：构建阶段装全量依赖并 `npm run build`，运行阶段只留 `express` + `dist/` + `server/`，镜像更小、无编译工具链。
- **数据持久化**：数据库固定写 `/app/data`（`NAVPAGE_DATA_DIR`），容器内该目录挂成数据卷，**删容器不丢收藏和自定义站点**；备份卷即可备份数据。
- **非 root 运行**：进程以镜像自带的 `node` 用户启动，`/app/data` 已授权。
- **健康检查**：容器每 30s 探一次 `/api/health`，`docker compose ps` 可直接看到 `healthy`。
- 基础镜像默认 `node:22-bookworm-slim`（内置 `node:sqlite`）；如换镜像，构建时会校验 `node:sqlite` 是否可用并给出提示。
- 构建走国内 npm 镜像，可用 `--build-arg NPM_REGISTRY=https://registry.npmjs.org/` 覆盖。

## 页面内管理（无需改代码）

顶栏或侧边栏的「管理」打开右侧抽屉，四个标签页覆盖所有日常配置：

| 标签 | 能做什么 |
| --- | --- |
| 分类 | 新增分类（名称 + emoji）、改名换图标、上下移调顺序、删除（站点可迁移到其它分类或一并删除） |
| 搜索引擎 | 新增 / 编辑 / 删除引擎，地址里 `{q}` 表示关键词位置；至少保留一个 |
| 外观 | 8 个预设主题色 + 自定义取色器、三档圆角、明暗模式，全部即时生效 |
| 数据 | 统计概览、恢复默认收藏、导出 JSON 备份、恢复出厂设置 |

站点的增删改直接在卡片上：悬浮卡片点铅笔编辑（名称 / 网址 / 说明 / 分类 / 图标底色 / 是否收藏），删除在编辑弹窗里；空分类有「添加第一个站点」入口。

## 架构

```
浏览器 (React)
   │  fetch /api/*            Vite dev 时由 proxy 转发；生产同端口直连
   ▼
Express (server/index.js)     校验 / 业务规则 / 统一错误响应
   ▼
node:sqlite (server/db.js)    事务 + WAL，data/navpage.db
```

前端数据流集中在 `src/store/NavStore.tsx`：启动时 `GET /api/bootstrap` 拉全量数据；收藏 / 主题等高频操作**先乐观更新界面再落库**，失败自动回滚并用 Toast 提示；分类 / 站点 / 引擎等结构变更以服务端返回为准。后端不可达时进入只读模式并显示重连提示。

外观（主题色 / 圆角）通过 `src/theme/appearance.ts` 在运行时把 CSS 变量写到 `<html>` 上，组件样式全部读变量，因此换肤不需要改任何 `.module.css`。

## 接口一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查，返回数据库路径 |
| GET | `/api/bootstrap` | 首屏一次拉取：分类 + 站点 + 引擎 + 收藏 + 偏好 |
| PUT | `/api/pins` | 整体替换收藏列表（事务，顺序即展示顺序） |
| POST / PATCH / DELETE | `/api/sites[/:id]` | 站点增删改（网址唯一，重复返回 409） |
| POST / PATCH / DELETE | `/api/categories[/:id]` | 分类增删改；删除时 `moveTo` 迁移站点或 `force` 一并删除 |
| PUT | `/api/categories/order` | 分类排序（传全量 id 数组） |
| POST / PATCH / DELETE | `/api/engines[/:id]` | 搜索引擎增删改（地址必须含 `{q}`） |
| PUT | `/api/preferences` | 更新偏好：engine / theme / palette / radius |
| GET | `/api/export` | 导出全量 JSON 备份 |
| POST | `/api/reset` | 恢复出厂设置 |

## 目录结构

```
navpage/
├── index.html                  # Vite 入口
├── vite.config.ts              # 开发代理 /api → 8787
├── tsconfig.json
├── Dockerfile                  # 多阶段镜像：deps → build → runtime
├── docker-compose.yml          # 一键构建 + 运行 + 数据卷 + 健康检查
├── docker-run.sh               # 构建/启动/日志/停止的封装脚本
├── .dockerignore
├── server/
│   ├── index.js                # Express：API 路由 + 静态托管 + 错误处理
│   ├── db.js                   # SQLite 建表 / 查询 / 迁移 / 种子（事务 + WAL）
│   └── seed-data.js            # 出厂数据（首次启动写入，之后以数据库为准）
├── data/                       # 运行时生成：navpage.db（不入库 git）
├── public/favicon.svg
├── src/
│   ├── main.tsx
│   ├── App.tsx                 # 页面组合 + 行为（弹窗 / 筛选 / 滚动定位）
│   ├── store/
│   │   └── NavStore.tsx        # ★ 全局数据仓库：bootstrap / 乐观更新 / 回滚
│   ├── api/nav.ts              # 接口封装（统一错误解析）
│   ├── theme/
│   │   └── appearance.ts       # ★ 外观预设与 CSS 变量注入（主题色 / 圆角 / 光晕）
│   ├── types.ts                # 全局类型
│   ├── utils/                  # url / color / filter 纯函数
│   ├── components/             # TopBar / SearchBar / Sidebar / SectionBlock /
│   │                           # SiteCard / SiteModal / SettingsPanel / Toast / icons
│   └── styles/
│       ├── tokens.css          # 设计令牌兜底值（运行时被外观设置覆盖）
│       └── base.css            # 全局重置 + 通用按钮
└── legacy-static/              # 旧版纯静态实现，仅参考，可整目录删除
```

## 功能

| 功能 | 说明 |
| --- | --- |
| 页面内管理 | 分类、站点、搜索引擎、外观全部在界面里增删改，存 SQLite |
| 服务端持久化 | 换浏览器、清缓存都不丢；改网址时收藏自动跟随 |
| 乐观更新 | 点星标、切主题立即生效，落库失败自动回滚并提示 |
| 多引擎搜索 | 内置 6 个引擎，可自行增删；回车用当前引擎搜索 |
| 实时筛选 | 输入即过滤卡片，按名称、描述、域名、分类匹配 |
| 常用置顶 | 星标收藏到顶部「常用」区，首次启动自动写入推荐站点 |
| 主题换肤 | 预设色板 + 自定义取色，主色联动高亮、按钮、背景光晕 |
| 深浅色 | 存在数据库，跨设备一致 |
| 滚动定位 | 侧边栏高亮当前分类，点击平滑滚动 |
| 图标降级 | 站点自带 favicon.ico → favicon.im → 首字母色块 |
| 快捷键 | `/` 或 `Ctrl/Cmd + K` 聚焦搜索；`Esc` 清空/关弹窗 |
| 备份恢复 | 一键导出 JSON；恢复出厂重新写入默认数据 |

## 部署

**推荐：Docker**（一条命令，自带 Node 与依赖）

```bash
docker compose up -d --build
```

**原生方式**：需要 Node.js ≥ 22.5。

```bash
npm ci --omit=dev && npm run build && npm start   # http://127.0.0.1:8787 同时服务 API 与 dist/
```

- 生产环境建议用 Docker Compose 或 `pm2` / `systemd` 守护
- 备份：容器方案备份数据卷（`docker run --rm -v navpage-data:/data -v $PWD:/backup alpine tar czf /backup/navpage-data.tgz -C /data .`），或在「管理 → 数据」里导出 JSON
- 如需多用户隔离，可给 `sites` / `pins` / `categories` 加 `user_id` 列并在接口层读取会话
