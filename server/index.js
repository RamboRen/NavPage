/**
 * NavPage 后端服务
 * ------------------------------------------------------------------
 * - 账号体系：不开放注册，仅首次启动时初始化超级管理员；其余账号由管理员创建
 * - 角色：admin（超级管理员）/ user（普通用户），账号管理接口仅 admin 可用
 * - 数据按账号隔离：分类、站点、搜索引擎、收藏、偏好都带 user_id
 * - 生产模式下同时把 dist/ 作为静态站点托管，单端口即可运行
 * 启动：npm run dev（前后端一起）或 npm start（生产）
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import express from 'express';
import {
  DB_FILE,
  ROOT,
  countAdmins,
  countUsers,
  createSession,
  createUser,
  deleteCategory,
  deleteEngine,
  deleteMeta,
  deleteSession,
  deleteSite,
  deleteUser,
  deleteUserSessions,
  ensureInitialized,
  exportAll,
  findSessionUser,
  findSiteByUrl,
  findUserByUsername,
  getCategory,
  getEngine,
  getMeta,
  getPreferences,
  getSite,
  getUser,
  getUserSecret,
  insertCategory,
  insertEngine,
  insertSite,
  listCategories,
  listEngines,
  listHotUrls,
  listPins,
  listSites,
  listUsers,
  replacePins,
  reorderCategories,
  resetAll,
  savePreferences,
  updateCategory,
  updateEngine,
  updateSite,
  updateUserPassword,
  updateUserProfile,
  updateUserRole
} from './db.js';
import {
  SESSION_TTL_DAYS,
  SESSION_TTL_HOURS,
  assertLoginAllowed,
  clearLoginFailures,
  clearSessionCookie,
  hashToken,
  newSessionToken,
  noteLoginFailure,
  readSessionToken,
  sessionCookie,
  sessionExpiry,
  verifyPassword
} from './auth.js';
import { DEFAULT_APPEARANCE } from './seed-data.js';

const PORT = Number(process.env.PORT) || 8787;
const DIST_DIR = path.join(ROOT, 'dist');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '64kb' }));

/* ---------------- 校验与错误处理 ---------------- */

class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code;
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

function parseSitePayload(userId, body) {
  const name = asText(body?.name);
  const url = asText(body?.url).replace(/\/+$/, '');
  const desc = asText(body?.desc).slice(0, 60);
  const categoryId = asText(body?.categoryId);
  const color = parseColor(body?.color);
  const icon = asText(body?.icon).slice(0, 300);

  assertSiteName(name);
  assertUrl(url);
  if (!categoryId) throw new HttpError(400, '请选择分类');
  if (!getCategory(userId, categoryId)) throw new HttpError(400, '分类不存在');

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

const parsePreferencesPayload = (userId, body) => {
  const patch = {};

  if (body?.engine !== undefined) {
    const engine = asText(body.engine);
    if (!engine || !getEngine(userId, engine)) throw new HttpError(400, '搜索引擎不存在');
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

const currentPreferences = (userId) => ({
  ...DEFAULT_APPEARANCE,
  theme: 'light',
  engine: '',
  ...getPreferences(userId)
});

/* ---------------- 账号与密码校验 ---------------- */

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5-]{2,20}$/;

function parseUsername(body) {
  const username = asText(body?.username);
  if (!USERNAME_RE.test(username)) {
    throw new HttpError(400, '账号需为 2-20 位字母、数字、下划线、短横线或中文');
  }
  return username;
}

function assertPassword(password, label = '密码') {
  if (typeof password !== 'string' || password.length < 6 || password.length > 64) {
    throw new HttpError(400, `${label}长度需为 6-64 位`);
  }
}

/**
 * 换发会话
 * remember=true  → 持久 Cookie（NAVPAGE_SESSION_DAYS，默认 30 天）
 * remember=false → 会话 Cookie（关浏览器即失效，服务端 NAVPAGE_SESSION_HOURS 兜底）
 */
function issueSession(res, user, remember = true) {
  const token = newSessionToken();
  createSession(user.id, hashToken(token), sessionExpiry(remember), remember);
  res.setHeader('Set-Cookie', sessionCookie(token, remember));
}

const legacyAccount = () => {
  const raw = getMeta('legacy_account');
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

/* ---------------- 中间件 ---------------- */

app.use((req, _res, next) => {
  const token = readSessionToken(req);
  if (token) {
    const session = findSessionUser(hashToken(token));
    if (session) {
      req.user = session.user;
      // 该会话是否勾选了「记住登录状态」，改密码换发会话时沿用
      req.sessionRemember = session.remember;
    }
  }
  next();
});

const requireAuth = (req, _res, next) => {
  if (!req.user) {
    next(new HttpError(401, '请先登录', 'UNAUTHORIZED'));
    return;
  }
  next();
};

/** 账号管理接口专用：必须是超级管理员 */
const requireAdmin = (req, _res, next) => {
  if (!req.user) {
    next(new HttpError(401, '请先登录', 'UNAUTHORIZED'));
    return;
  }
  if (req.user.role !== 'admin') {
    next(new HttpError(403, '仅超级管理员可以管理账号', 'FORBIDDEN'));
    return;
  }
  next();
};

/* ---------------- 健康检查（无需登录，供 Docker 探活） ---------------- */

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, database: DB_FILE });
});

/* ---------------- 账号 ---------------- */

const REGISTER_CLOSED = '系统已关闭注册，新账号请由超级管理员在「管理 → 用户」中创建';

app.get('/api/auth/status', (_req, res) => {
  res.json({
    hasUsers: countUsers() > 0,
    defaultAccount: legacyAccount(),
    session: { rememberDays: SESSION_TTL_DAYS, sessionHours: SESSION_TTL_HOURS }
  });
});

/**
 * 只在全新实例（一个账号都没有）时可用：
 * 用来初始化第一个超级管理员，之后该入口一律 403。
 */
app.post('/api/auth/register', (req, res) => {
  if (countUsers() > 0) throw new HttpError(403, REGISTER_CLOSED, 'REGISTER_CLOSED');

  const username = parseUsername(req.body);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  assertPassword(password);

  if (findUserByUsername(username)) throw new HttpError(409, '这个账号已经被注册了');

  const displayName = asText(req.body?.displayName).slice(0, 20) || username;
  const user = createUser({ username, password, displayName, role: 'admin' });
  issueSession(res, user, req.body?.remember !== false);

  res.status(201).json({ user, isFirstUser: true });
});

app.post('/api/auth/login', (req, res) => {
  const username = asText(req.body?.username);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!username || !password) throw new HttpError(400, '请输入账号和密码');

  // 未传 remember 时按「记住登录」处理，兼容旧前端
  const remember = req.body?.remember !== false;

  const throttleKey = `${req.ip}|${username.toLowerCase()}`;
  assertLoginAllowed(throttleKey);

  const record = findUserByUsername(username);
  if (!record || !verifyPassword(password, record.password_hash)) {
    noteLoginFailure(throttleKey);
    throw new HttpError(401, '账号或密码不正确');
  }

  clearLoginFailures(throttleKey);
  const user = getUser(record.id);
  issueSession(res, user, remember);
  res.json({ user, remember });
});

app.post('/api/auth/logout', (req, res) => {
  const token = readSessionToken(req);
  if (token) deleteSession(hashToken(token));
  res.setHeader('Set-Cookie', clearSessionCookie());
  res.status(204).end();
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

app.patch('/api/auth/profile', requireAuth, (req, res) => {
  const displayName = asText(req.body?.displayName);
  if (!displayName || charLength(displayName) > 20) throw new HttpError(400, '昵称需为 1-20 个字符');
  res.json({ user: updateUserProfile(req.user.id, { displayName }) });
});

app.patch('/api/auth/password', requireAuth, (req, res) => {
  const currentPassword = typeof req.body?.currentPassword === 'string' ? req.body.currentPassword : '';
  const newPassword = typeof req.body?.newPassword === 'string' ? req.body.newPassword : '';

  assertPassword(newPassword, '新密码');
  if (currentPassword === newPassword) throw new HttpError(400, '新密码不能与当前密码相同');

  const secret = getUserSecret(req.user.id);
  if (!secret || !verifyPassword(currentPassword, secret.password_hash)) {
    throw new HttpError(400, '当前密码不正确');
  }

  updateUserPassword(req.user.id, newPassword);

  // 改密后让其它设备上的会话失效，并给当前设备换一个新会话（沿用「记住登录」设置）
  deleteUserSessions(req.user.id);
  issueSession(res, req.user, req.sessionRemember !== false);

  // 出厂迁移账号的初始密码提示到此失效
  const legacy = legacyAccount();
  if (legacy && legacy.username === req.user.username) {
    deleteMeta('legacy_account');
  }

  res.json({ ok: true });
});

/* ---------------- 账号管理（仅超级管理员） ---------------- */

app.get('/api/users', requireAdmin, (_req, res) => {
  res.json({ users: listUsers() });
});

app.post('/api/users', requireAdmin, (req, res) => {
  const username = parseUsername(req.body);
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  assertPassword(password, '初始密码');

  if (findUserByUsername(username)) throw new HttpError(409, '这个账号已存在');

  const displayName = asText(req.body?.displayName).slice(0, 20) || username;
  const role = req.body?.role === 'admin' ? 'admin' : 'user';
  const user = createUser({ username, password, displayName, role });

  res.status(201).json({ user });
});

app.patch('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = Number.isInteger(id) ? getUser(id) : null;
  if (!target) throw new HttpError(404, '账号不存在');

  const patch = {};

  if (req.body?.displayName !== undefined) {
    const displayName = asText(req.body.displayName);
    if (!displayName || charLength(displayName) > 20) throw new HttpError(400, '昵称需为 1-20 个字符');
    patch.displayName = displayName;
  }

  if (req.body?.password !== undefined) {
    const password = typeof req.body.password === 'string' ? req.body.password : '';
    assertPassword(password, '新密码');
    patch.password = password;
  }

  if (req.body?.role !== undefined) {
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    if (target.id === req.user.id && role !== 'admin') {
      throw new HttpError(400, '不能取消自己的超级管理员身份');
    }
    if (target.role === 'admin' && role !== 'admin' && countAdmins() <= 1) {
      throw new HttpError(400, '至少要保留一个超级管理员');
    }
    patch.role = role;
  }

  if (!Object.keys(patch).length) throw new HttpError(400, '没有需要修改的内容');

  if (patch.displayName) updateUserProfile(id, { displayName: patch.displayName });
  if (patch.role) updateUserRole(id, patch.role);
  if (patch.password) {
    updateUserPassword(id, patch.password);
    // 管理自己时保留当前会话，重置别人密码则让对方重新登录
    if (id !== req.user.id) deleteUserSessions(id);
  }

  res.json({ user: getUser(id) });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) throw new HttpError(400, '账号编号不合法');
  if (id === req.user.id) throw new HttpError(400, '不能删除当前登录的账号');

  const target = getUser(id);
  if (!target) throw new HttpError(404, '账号不存在');
  if (target.role === 'admin' && countAdmins() <= 1) {
    throw new HttpError(400, '至少要保留一个超级管理员');
  }

  deleteUser(id);
  res.status(204).end();
});

/* ---------------- 以下接口都需要登录 ---------------- */

app.use('/api', requireAuth);

/** 首屏一次性拉取当前账号的全部数据 */
app.get('/api/bootstrap', (req, res) => {
  const userId = req.user.id;
  res.json({
    user: req.user,
    categories: listCategories(userId),
    sites: listSites(userId),
    engines: listEngines(userId),
    pins: listPins(userId),
    preferences: currentPreferences(userId)
  });
});

app.get('/api/export', (req, res) => {
  const user = req.user;
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="navpage-${encodeURIComponent(user.username)}-backup.json"`
  );
  res.json(exportAll(user.id));
});

app.put('/api/pins', (req, res) => {
  res.json({ pins: replacePins(req.user.id, parsePinsPayload(req.body)) });
});

/* ---------- 站点 ---------- */

app.post('/api/sites', (req, res) => {
  const userId = req.user.id;
  const payload = parseSitePayload(userId, req.body);
  if (findSiteByUrl(userId, payload.url)) throw new HttpError(409, '这个网址已经在导航里了');
  res.status(201).json({ site: insertSite(userId, { ...payload, hot: Boolean(req.body?.hot) }) });
});

app.patch('/api/sites/:id', (req, res) => {
  const userId = req.user.id;
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id 不合法');
  if (!getSite(userId, id)) throw new HttpError(404, '站点不存在');

  const payload = parseSitePayload(userId, req.body);
  const duplicate = findSiteByUrl(userId, payload.url);
  if (duplicate && duplicate.id !== id) throw new HttpError(409, '这个网址已经被其它站点使用了');

  res.json({ site: updateSite(userId, id, payload) });
});

app.delete('/api/sites/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'id 不合法');
  if (!deleteSite(req.user.id, id)) throw new HttpError(404, '站点不存在');
  res.status(204).end();
});

/* ---------- 分类 ---------- */

app.post('/api/categories', (req, res) => {
  const userId = req.user.id;
  const payload = parseCategoryPayload(req.body);
  if (listCategories(userId).some((item) => item.name === payload.name)) {
    throw new HttpError(409, '已经有同名分类了');
  }
  res.status(201).json({ category: insertCategory(userId, payload) });
});

app.patch('/api/categories/:id', (req, res) => {
  const userId = req.user.id;
  const id = asText(req.params.id);
  const payload = parseCategoryPayload(req.body, { partial: true });
  if (listCategories(userId).some((item) => item.name === payload.name && item.id !== id)) {
    throw new HttpError(409, '已经有同名分类了');
  }
  const category = updateCategory(userId, id, payload);
  if (!category) throw new HttpError(404, '分类不存在');
  res.json({ category });
});

app.delete('/api/categories/:id', (req, res) => {
  const userId = req.user.id;
  const id = asText(req.params.id);
  const moveTo = asText(req.body?.moveTo) || null;
  const force = Boolean(req.body?.force);

  if (moveTo && !getCategory(userId, moveTo)) throw new HttpError(400, '目标分类不存在');
  if (moveTo === id) throw new HttpError(400, '不能迁移到自身');

  const result = deleteCategory(userId, id, { moveTo, force });
  if (!result) throw new HttpError(404, '分类不存在');

  // 分类没了，收藏里指向它的站点已被级联删除，这里清理悬空收藏
  const alive = new Set(listSites(userId).map((site) => site.url));
  const pins = listPins(userId);
  if (pins.some((url) => !alive.has(url))) {
    replacePins(userId, pins.filter((url) => alive.has(url)));
  }

  res.json({
    ...result,
    categories: listCategories(userId),
    sites: listSites(userId),
    pins: listPins(userId)
  });
});

app.put('/api/categories/order', (req, res) => {
  const userId = req.user.id;
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || ids.length === 0) throw new HttpError(400, 'ids 必须是非空数组');

  const existing = listCategories(userId).map((item) => item.id);
  const sameSet =
    ids.length === existing.length && ids.every((id) => existing.includes(id)) && new Set(ids).size === ids.length;
  if (!sameSet) throw new HttpError(400, 'ids 必须包含全部且不重复的分类');

  res.json({ categories: reorderCategories(userId, ids) });
});

/* ---------- 搜索引擎 ---------- */

app.post('/api/engines', (req, res) => {
  const payload = parseEnginePayload(req.body);
  res.status(201).json({ engine: insertEngine(req.user.id, payload) });
});

app.patch('/api/engines/:id', (req, res) => {
  const engine = updateEngine(req.user.id, asText(req.params.id), parseEnginePayload(req.body, { partial: true }));
  if (!engine) throw new HttpError(404, '搜索引擎不存在');
  res.json({ engine });
});

app.delete('/api/engines/:id', (req, res) => {
  const userId = req.user.id;
  if (!deleteEngine(userId, asText(req.params.id))) throw new HttpError(404, '搜索引擎不存在');

  const engines = listEngines(userId);
  const prefs = getPreferences(userId);
  if (!engines.some((item) => item.id === prefs.engine)) {
    savePreferences(userId, { engine: engines[0]?.id || '' });
  }
  res.json({ engines, preferences: currentPreferences(userId) });
});

/* ---------- 偏好 / 维护 ---------- */

app.put('/api/preferences', (req, res) => {
  const userId = req.user.id;
  res.json({
    preferences: {
      ...currentPreferences(userId),
      ...savePreferences(userId, parsePreferencesPayload(userId, req.body))
    }
  });
});

/** 恢复出厂：只清空当前账号的内容 */
app.post('/api/reset', (req, res) => {
  const userId = req.user.id;
  resetAll(userId);
  res.json({
    categories: listCategories(userId),
    sites: listSites(userId),
    engines: listEngines(userId),
    pins: listPins(userId),
    preferences: currentPreferences(userId),
    hotUrls: listHotUrls(userId)
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
    res.status(error.status).json({ error: error.message, code: error.code });
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
  console.log(`账号数量      →  ${countUsers()}（不开放注册，仅管理员可添加账号）`);
});
