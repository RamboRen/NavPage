/**
 * SQLite 持久化层
 * ------------------------------------------------------------------
 * 使用 Node 22 内置的 node:sqlite，无需安装 / 编译任何原生模块。
 * 数据库文件默认位于 <项目根>/data/navpage.db，可用 NAVPAGE_DATA_DIR 覆盖。
 *
 * 数据模型（v3）：
 *   categories  分类       id / name / icon / position
 *   sites       站点       id / name / url / category_id / color / icon / hot / position
 *   engines     搜索引擎   id / name / url / position
 *   pins        「常用」    url / position
 *   preferences 偏好       key / value
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { DEFAULT_APPEARANCE, DEFAULT_CATEGORIES, DEFAULT_ENGINES } from './seed-data.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NAVPAGE_DATA_DIR || path.join(ROOT, 'data');

mkdirSync(DATA_DIR, { recursive: true });

export const DB_FILE = path.join(DATA_DIR, 'navpage.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS categories (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    icon     TEXT NOT NULL DEFAULT '📁',
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS sites (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    url         TEXT NOT NULL UNIQUE,
    description TEXT,
    category_id TEXT NOT NULL REFERENCES categories (id) ON DELETE CASCADE,
    color       TEXT,
    icon        TEXT,
    hot         INTEGER NOT NULL DEFAULT 0,
    position    INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS engines (
    id       TEXT PRIMARY KEY,
    name     TEXT NOT NULL,
    url      TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS pins (
    url        TEXT PRIMARY KEY,
    position   INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS preferences (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sites_category ON sites (category_id, position);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories (name);
`);

/** 同步事务封装：出错自动回滚 */
function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const nextPosition = (table, where = '', value) => {
  const sql = `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table}${where}`;
  const row = where ? db.prepare(sql).get(value) : db.prepare(sql).get();
  return Number(row.next);
};

/* ---------------- 分类 ---------------- */

const toCategory = (row) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  position: Number(row.position)
});

export function listCategories() {
  return db.prepare('SELECT * FROM categories ORDER BY position ASC, id ASC').all().map(toCategory);
}

export function getCategory(id) {
  const row = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  return row ? toCategory(row) : null;
}

export function insertCategory({ name, icon }) {
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const position = nextPosition('categories');
  db.prepare('INSERT INTO categories (id, name, icon, position) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    icon || '📁',
    position
  );
  return getCategory(id);
}

export function updateCategory(id, patch) {
  const current = getCategory(id);
  if (!current) return null;
  db.prepare('UPDATE categories SET name = ?, icon = ? WHERE id = ?').run(
    patch.name ?? current.name,
    patch.icon ?? current.icon,
    id
  );
  return getCategory(id);
}

/** 删除分类：站点可迁移到 moveTo，否则一并删除 */
export function deleteCategory(id, { moveTo = null, force = false } = {}) {
  const current = getCategory(id);
  if (!current) return null;

  const { n } = db.prepare('SELECT COUNT(*) AS n FROM sites WHERE category_id = ?').get(id);

  return transaction(() => {
    if (n > 0) {
      if (moveTo) db.prepare('UPDATE sites SET category_id = ? WHERE category_id = ?').run(moveTo, id);
      else if (force) db.prepare('DELETE FROM sites WHERE category_id = ?').run(id);
      else throw Object.assign(new Error('该分类下还有站点'), { status: 409 });
    }
    db.prepare('DELETE FROM categories WHERE id = ?').run(id);
    return { deleted: id, movedSites: moveTo ? Number(n) : 0, removedSites: moveTo ? 0 : Number(n) };
  });
}

export function reorderCategories(ids) {
  const update = db.prepare('UPDATE categories SET position = ? WHERE id = ?');
  transaction(() => ids.forEach((id, index) => update.run(index, id)));
  return listCategories();
}

/* ---------------- 站点 ---------------- */

const toSite = (row) => ({
  id: Number(row.id),
  name: row.name,
  url: row.url,
  desc: row.description ?? '',
  categoryId: row.category_id,
  color: row.color ?? undefined,
  icon: row.icon ?? undefined,
  hot: Boolean(row.hot),
  position: Number(row.position)
});

export function listSites() {
  return db
    .prepare(
      `SELECT s.* FROM sites s
       JOIN categories c ON c.id = s.category_id
       ORDER BY c.position ASC, s.position ASC, s.id ASC`
    )
    .all()
    .map(toSite);
}

export function getSite(id) {
  const row = db.prepare('SELECT * FROM sites WHERE id = ?').get(id);
  return row ? toSite(row) : null;
}

export function findSiteByUrl(url) {
  const row = db.prepare('SELECT * FROM sites WHERE url = ?').get(url);
  return row ? toSite(row) : null;
}

export function insertSite({ name, url, desc, categoryId, color, icon, hot = false }) {
  const position = nextPosition('sites', ' WHERE category_id = ?', categoryId);
  const result = db
    .prepare(
      `INSERT INTO sites (name, url, description, category_id, color, icon, hot, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(name, url, desc || null, categoryId, color || null, icon || null, hot ? 1 : 0, position);

  return getSite(Number(result.lastInsertRowid));
}

export function updateSite(id, patch) {
  const current = getSite(id);
  if (!current) return null;

  const categoryId = patch.categoryId ?? current.categoryId;
  const movedCategory = categoryId !== current.categoryId;
  const position = movedCategory
    ? nextPosition('sites', ' WHERE category_id = ?', categoryId)
    : current.position;

  db.prepare(
    `UPDATE sites
       SET name = ?, url = ?, description = ?, category_id = ?, color = ?, icon = ?, position = ?
     WHERE id = ?`
  ).run(
    patch.name ?? current.name,
    patch.url ?? current.url,
    patch.desc ?? current.desc,
    categoryId,
    patch.color === undefined ? current.color ?? null : patch.color || null,
    patch.icon === undefined ? current.icon ?? null : patch.icon || null,
    position,
    id
  );

  // 网址变了，收藏里指向旧地址的记录要跟着改，否则「常用」会丢
  if (current.url !== (patch.url ?? current.url)) {
    db.prepare('UPDATE OR REPLACE pins SET url = ? WHERE url = ?').run(patch.url, current.url);
  }

  return getSite(id);
}

export function deleteSite(id) {
  const site = getSite(id);
  if (!site) return false;
  transaction(() => {
    db.prepare('DELETE FROM sites WHERE id = ?').run(id);
    db.prepare('DELETE FROM pins WHERE url = ?').run(site.url);
  });
  return true;
}

/* ---------------- 搜索引擎 ---------------- */

const toEngine = (row) => ({
  id: row.id,
  name: row.name,
  url: row.url,
  position: Number(row.position)
});

export function listEngines() {
  return db.prepare('SELECT * FROM engines ORDER BY position ASC, id ASC').all().map(toEngine);
}

export function getEngine(id) {
  const row = db.prepare('SELECT * FROM engines WHERE id = ?').get(id);
  return row ? toEngine(row) : null;
}

export function insertEngine({ name, url }) {
  const id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  db.prepare('INSERT INTO engines (id, name, url, position) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    url,
    nextPosition('engines')
  );
  return getEngine(id);
}

export function updateEngine(id, patch) {
  const current = getEngine(id);
  if (!current) return null;
  db.prepare('UPDATE engines SET name = ?, url = ? WHERE id = ?').run(
    patch.name ?? current.name,
    patch.url ?? current.url,
    id
  );
  return getEngine(id);
}

export function deleteEngine(id) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM engines').get();
  if (n <= 1) throw Object.assign(new Error('至少要保留一个搜索引擎'), { status: 409 });
  return db.prepare('DELETE FROM engines WHERE id = ?').run(id).changes > 0;
}

/* ---------------- 「常用」收藏 ---------------- */

export function listPins() {
  return db
    .prepare('SELECT url FROM pins ORDER BY position ASC, created_at ASC')
    .all()
    .map((row) => row.url);
}

/** 用给定列表整体替换收藏（顺序即展示顺序），事务保证原子性 */
export function replacePins(urls) {
  const removeAll = db.prepare('DELETE FROM pins');
  const insert = db.prepare('INSERT INTO pins (url, position) VALUES (?, ?)');

  transaction(() => {
    removeAll.run();
    urls.forEach((url, index) => insert.run(url, index));
  });

  return listPins();
}

/** 推荐站点（出厂数据里标记 hot 的，且现在仍存在） */
export function listHotUrls() {
  return db.prepare('SELECT url FROM sites WHERE hot = 1 ORDER BY id ASC').all().map((row) => row.url);
}

/* ---------------- 偏好设置 ---------------- */

export function getPreferences() {
  const rows = db.prepare('SELECT key, value FROM preferences').all();
  const prefs = {};
  rows.forEach((row) => {
    prefs[row.key] = row.value;
  });
  return prefs;
}

export function savePreferences(patch) {
  const upsert = db.prepare(
    'INSERT INTO preferences (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  transaction(() => {
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      upsert.run(key, String(value));
    });
  });

  return getPreferences();
}

/* ---------------- 种子 / 重置 / 迁移 ---------------- */

function writeDefaults() {
  const insertCategory = db.prepare(
    'INSERT INTO categories (id, name, icon, position) VALUES (?, ?, ?, ?)'
  );
  const insertSite = db.prepare(
    `INSERT OR IGNORE INTO sites (name, url, description, category_id, color, icon, hot, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEngine = db.prepare('INSERT INTO engines (id, name, url, position) VALUES (?, ?, ?, ?)');

  DEFAULT_CATEGORIES.forEach((category, categoryIndex) => {
    insertCategory.run(category.id, category.name, category.icon, categoryIndex);
    category.sites.forEach((site, siteIndex) => {
      insertSite.run(
        site.name,
        site.url,
        site.desc ?? null,
        category.id,
        site.color ?? null,
        site.icon ?? null,
        site.hot ? 1 : 0,
        siteIndex
      );
    });
  });

  DEFAULT_ENGINES.forEach((engine, index) => {
    insertEngine.run(`e${index + 1}`, engine.name, engine.url, index);
  });
}

/** 出厂内容：分类 + 站点 + 引擎 */
export function seedContent({ force = false } = {}) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM categories').get();
  if (!force && n > 0) return false;

  transaction(() => {
    if (force) {
      db.prepare('DELETE FROM sites').run();
      db.prepare('DELETE FROM categories').run();
      db.prepare('DELETE FROM engines').run();
    }
    writeDefaults();
  });

  return true;
}

/** 首次启动：写入出厂内容 + 默认收藏（只做一次） */
export function ensureInitialized() {
  seedContent();
  migrateLegacyCustomSites();

  const prefs = getPreferences();
  if (prefs.seeded !== 'true') {
    replacePins(listHotUrls());
    savePreferences({
      seeded: 'true',
      engine: prefs.engine || listEngines()[0]?.id || '',
      theme: prefs.theme || 'light',
      palette: prefs.palette || DEFAULT_APPEARANCE.palette,
      radius: prefs.radius || DEFAULT_APPEARANCE.radius
    });
  }
}

/** 旧版本把自定义站点放在 custom_sites 表里，这里做一次性迁移 */
function migrateLegacyCustomSites() {
  const exists = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'custom_sites'")
    .get();
  if (!exists) return;

  const rows = db.prepare('SELECT * FROM custom_sites').all();
  if (!rows.length) return;

  const categoryIds = new Set(listCategories().map((item) => item.id));
  rows.forEach((row) => {
    if (!categoryIds.has(row.category_id)) return;
    if (findSiteByUrl(row.url)) return;
    insertSite({
      name: row.name,
      url: row.url,
      desc: row.description ?? '',
      categoryId: row.category_id,
      color: row.color ?? undefined,
      hot: false
    });
  });
}

/** 恢复出厂：清空内容与收藏，重新写入出厂数据 */
export function resetAll() {
  transaction(() => {
    db.prepare('DELETE FROM pins').run();
    db.prepare('DELETE FROM sites').run();
    db.prepare('DELETE FROM categories').run();
    db.prepare('DELETE FROM engines').run();
  });

  seedContent({ force: true });
  replacePins(listHotUrls());
  savePreferences({
    seeded: 'true',
    engine: listEngines()[0]?.id || '',
    theme: 'light',
    ...DEFAULT_APPEARANCE
  });

  return true;
}

/** 全量快照，用于导出备份 */
export function exportAll() {
  return {
    version: 3,
    exportedAt: new Date().toISOString(),
    categories: listCategories(),
    sites: listSites(),
    engines: listEngines(),
    pins: listPins(),
    preferences: getPreferences()
  };
}

export default db;
