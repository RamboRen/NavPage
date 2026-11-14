/**
 * NavPage 后端服务
 * ------------------------------------------------------------------
 * - 提供 /api/* 数据接口（SQLite 持久化）
 * - 生产模式下同时把 dist/ 作为静态站点托管，单端口即可运行
 * 启动：npm run dev（前后端一起）或 npm start（生产）
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  DB_FILE,
  ROOT,
  deleteCategory,
  deleteEngine,
  deleteSite,
  ensureInitialized,
  exportAll,
  findSiteByUrl,
  getCategory,
  getEngine,
  getPreferences,
  insertCategory,
  insertEngine,
  insertSite,
  listCategories,
  listEngines,
  listHotUrls,
  listPins,
  listSites,
  replacePins,
  reorderCategories,
  resetAll,
  savePreferences,
  updateCategory,
  updateEngine,
  updateSite
} from './db.js';
import { DEFAULT_APPEARANCE } from './seed-data.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST_DIR = path.join(ROOT, 'dist');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

/* ---------------- 校验与错误处理 ---------------- */

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const asText = (value) => (typeof value === 'string' ? value.trim() : '');
const charLength = (text) => [...text].length;

function assertSiteName(name) {
  if (!name || charLength(name) > 20) throw new HttpError(400, '名称需为 1-20 个字符');
}

function assertUrl(url) {
  if (!/^https?:\/\/[\w.-]+(:\d+)?(\/.*)?$/i.test(url)) {
    throw new HttpError(400, '网址格式不正确，需以 http:// 或 https:// 开头');
  }
}

/** 颜色允许为空；有值必须是 #rrggbb */
function parseColor(value) {
  const color = asText(value);
  if (!color) return '';
  if (!/^#[0-9a-f]{6}$/i.test(color)) throw new HttpError(400, '颜色需要是 #rrggbb 格式');
  return color.toLowerCase();
}

function parsePinsPayload(body) {
  const pins = body?.pins;
  if (!Array.isArray(pins)) throw new HttpError(400, 'pins 必须是数组');

  const cleaned = [];
  pins.forEach((item) => {
    const url = asText(item);
    if (!/^https?:\/\//i.test(url)) return;
    if (!cleaned.includes(url)) cleaned.push(url);
  });

  if (cleaned.length > 500) throw new HttpError(400, '收藏数量过多');
  return cleaned;
}

function parseSitePayload(body) {
  const name = asText(body?.name);
  const url = asText(body?.url).replace(/\/+$/, '');
  const desc = asText(body?.desc).slice(0, 60);
  const categoryId = asText(body?.categoryId);
  const color = parseColor(body?.color);
  const icon = asText(body?.icon).slice(0, 300);

  assertSiteName(name);
  assertUrl(url);
  if (!categoryId) throw new HttpError(400, '请选择分类');
  if (!getCategory(categoryId)) throw new HttpError(400, '分类不存在');

  return { name, url, desc, categoryId, color, icon };
}

function parseCategoryPayload(body, { partial = false } = {}) {
  const patch = {};
  if (body?.name !== undefined || !partial) {
    const name = asText(body?.name);
    if (!name || charLength(name) > 12) throw new HttpError(400, '分类名称需为 1-12 个字符');
    patch.name = name;
  }
  if (body?.icon !== undefined || !partial) {
    const icon = asText(body?.icon) || '📁';
    if (charLength(icon) > 4) throw new HttpError(400, '图标请使用 1-2 个 emoji');
    patch.icon = icon;
  }
  if (!Object.keys(patch).length) throw new HttpError(400, '没有需要修改的内容');
  return patch;
}

function parseEnginePayload(body, { partial = false } = {}) {
  const patch = {};
  if (body?.name !== undefined || !partial) {
    const name = asText(body?.name);
    if (!name || charLength(name) > 16) throw new HttpError(400, '引擎名称需为 1-16 个字符');
    patch.name = name;
  }
  if (body?.url !== undefined || !partial) {
    const url = asText(body?.url);
    if (!/^https?:\/\//i.test(url)) throw new HttpError(400, '搜索地址需以 http:// 或 https:// 开头');
    if (!url.includes('{q}')) throw new HttpError(400, '搜索地址里需要用 {q} 占位关键词');
    patch.url = url;
  }
  if (!Object.keys(patch).length) throw new HttpError(400, '没有需要修改的内容');
  return patch;
}

const parsePreferencesPayload = (body) => {
  const patch = {};

  if (body?.engine !== undefined) {
    const engine = asText(body.engine);
    if (!engine || !getEngine(engine)) throw new HttpError(400, '搜索引擎不存在');
    patch.engine = engine;
  }
  if (body?.theme !== undefined) {
    const theme = asText(body.theme);
    if (theme !== 'light' && theme !== 'dark') throw new HttpError(400, 'theme 只能是 light 或 dark');
    patch.theme = theme;
  }
  if (body?.palette !== undefined) {
    const palette = asText(body.palette);
    if (!/^#[0-9a-f]{6}$/i.test(palette)) throw new HttpError(400, '主题色需要是 #rrggbb 格式');
    patch.palette = palette.toLowerCase();
  }
  if (body?.radius !== undefined) {
    const radius = asText(body.radius);
    if (!['compact', 'default', 'round'].includes(radius)) throw new HttpError(400, '圆角样式不合法');
    patch.radius = radius;
  }

  if (!Object.keys(patch).length) throw new HttpError(400, '没有需要保存的偏好设置');
  return patch;
};

const currentPreferences = () => ({ ...DEFAULT_APPEARANCE, theme: 'light', engine: '', ...getPreferences() });

/* ---------------- 接口 ---------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: DB_FILE });
});

/** 首屏一次性拉取全部数据 */
app.get('/api/bootstrap', (_req, res) => {
  res.json({
    categories: listCategories(),
    sites: listSites(),
    engines: listEngines(),
    pins: listPins(),
    preferences: currentPreferences()
  });
});

app.get('/api/export', (_req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="navpage-backup.json"');
  res.json(exportAll());
});

app.put('/api/pins', (req, res) => {
  res.json({ pins: replacePins(parsePinsPayload(req.body)) });
});

/* ---------- 站点 ---------- */

app.post('/api/sites', (req, res) => {
  const payload = parseSitePayload(req.body);
  if (findSiteByUrl(payload.url)) throw new HttpError(409, '这个网址已经在导航里了');
  res.status(201).json({ site: insertSite({ ...payload, hot: Boolean(req.body?.hot) }) });
});

app.patch('/api/sites/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id 不合法');

  const payload = parseSitePayload(req.body);
  const duplicate = findSiteByUrl(payload.url);
  if (duplicate && duplicate.id !== id) throw new HttpError(409, '这个网址已经被其它站点使用了');

  const site = updateSite(id, payload);
  if (!site) throw new HttpError(404, '站点不存在');
  res.json({ site });
});

app.delete('/api/sites/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id 不合法');
  if (!deleteSite(id)) throw new HttpError(404, '站点不存在');
  res.status(204).end();
});

/* ---------- 分类 ---------- */

app.post('/api/categories', (req, res) => {
  const payload = parseCategoryPayload(req.body);
  if (listCategories().some((item) => item.name === payload.name)) {
    throw new HttpError(409, '已经有同名分类了');
  }
  res.status(201).json({ category: insertCategory(payload) });
});

app.patch('/api/categories/:id', (req, res) => {
  const id = asText(req.params.id);
  const payload = parseCategoryPayload(req.body, { partial: true });
  if (listCategories().some((item) => item.name === payload.name && item.id !== id)) {
    throw new HttpError(409, '已经有同名分类了');
  }
  const category = updateCategory(id, payload);
  if (!category) throw new HttpError(404, '分类不存在');
  res.json({ category });
});

app.delete('/api/categories/:id', (req, res) => {
  const id = asText(req.params.id);
  const moveTo = asText(req.body?.moveTo) || null;
  const force = Boolean(req.body?.force);

  if (moveTo && !getCategory(moveTo)) throw new HttpError(400, '目标分类不存在');
  if (moveTo === id) throw new HttpError(400, '不能迁移到自身');

  const result = deleteCategory(id, { moveTo, force });
  if (!result) throw new HttpError(404, '分类不存在');

  // 分类没了，收藏里指向它的站点已被级联删除，这里清理悬空收藏
  const alive = new Set(listSites().map((site) => site.url));
  const pins = listPins();
  if (pins.some((url) => !alive.has(url))) replacePins(pins.filter((url) => alive.has(url)));

  res.json({ ...result, categories: listCategories(), sites: listSites(), pins: listPins() });
});

app.put('/api/categories/order', (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'ids 必须是非空数组');

  const existing = listCategories().map((item) => item.id);
  const sameSet =
    ids.length === existing.length && ids.every((id) => existing.includes(id)) && new Set(ids).size === ids.length;
  if (!sameSet) throw new HttpError(400, 'ids 必须包含全部且不重复的分类');

  res.json({ categories: reorderCategories(ids) });
});

/* ---------- 搜索引擎 ---------- */

app.post('/api/engines', (req, res) => {
  const payload = parseEnginePayload(req.body);
  res.status(201).json({ engine: insertEngine(payload) });
});

app.patch('/api/engines/:id', (req, res) => {
  const id = asText(req.params.id);
  const engine = updateEngine(id, parseEnginePayload(req.body, { partial: true }));
  if (!engine) throw new HttpError(404, '搜索引擎不存在');
  res.json({ engine });
});

app.delete('/api/engines/:id', (req, res) => {
  const id = asText(req.params.id);
  if (!deleteEngine(id)) throw new HttpError(404, '搜索引擎不存在');

  const engines = listEngines();
  const prefs = getPreferences();
  if (!engines.some((item) => item.id === prefs.engine)) {
    savePreferences({ engine: engines[0]?.id || '' });
  }
  res.json({ engines, preferences: currentPreferences() });
});

/* ---------- 偏好 / 维护 ---------- */

app.put('/api/preferences', (req, res) => {
  res.json({ preferences: { ...currentPreferences(), ...savePreferences(parsePreferencesPayload(req.body)) } });
});

/** 恢复出厂：清空所有自定义内容，重新写入默认数据 */
app.post('/api/reset', (_req, res) => {
  resetAll();
  res.json({
    categories: listCategories(),
    sites: listSites(),
    engines: listEngines(),
    pins: listPins(),
    preferences: currentPreferences(),
    hotUrls: listHotUrls()
  });
});

// 未匹配的 /api 请求统一返回 JSON 错误，避免落到前端页面上
app.use('/api', (_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

/* ---------------- 静态资源（生产构建） ---------------- */

if (existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
    res.sendFile(path.join(DIST_DIR, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res
      .status(200)
      .type('html')
      .send('<h1>NavPage API 已启动</h1><p>前端还未构建：开发时请用 <code>npm run dev</code>，生产请先 <code>npm run build</code>。</p>');
  });
}

/* ---------------- 统一错误响应 ---------------- */

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error?.status && typeof error.message === 'string') {
    res.status(error.status).json({ error: error.message });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: '请求体不是合法的 JSON' });
    return;
  }
  console.error('[api] 未处理异常：', error);
  res.status(500).json({ error: '服务器内部错误' });
});

ensureInitialized();

app.listen(PORT, () => {
  console.log(`NavPage API  →  http://127.0.0.1:${PORT}`);
  console.log(`数据库文件    →  ${DB_FILE}`);
});
