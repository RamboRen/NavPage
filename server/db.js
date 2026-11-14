/**
 * SQLite 持久化层（多用户版 v4）
 * ------------------------------------------------------------------
 * 使用 Node 22 内置的 node:sqlite，无需安装 / 编译任何原生模块。
 * 数据库文件默认位于 <项目根>/data/navpage.db，可用 NAVPAGE_DATA_DIR 覆盖。
 *
 * 数据模型：
 *   users       账号      id / username / password_hash / display_name / role（admin | user）
 *   sessions    会话      token_hash / user_id / expires_at
 *   categories  分类      (user_id, id) / name / icon / position
 *   sites       站点      id / user_id / url / category_id / …（同一账号内网址唯一）
 *   engines     搜索引擎  (user_id, id) / name / url
 *   pins        「常用」  (user_id, url) / position
 *   preferences 偏好      (user_id, key) / value
 *
 * 旧版本（v3 单用户）的表在首次启动时会被改名为 v3_*，
 * 数据整体归入一个默认账号（NAVPAGE_ADMIN_USER / NAVPAGE_ADMIN_PASSWORD），
 * 迁移完成后旧表删除。
 */
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './auth.js';
import { DEFAULT_APPEARANCE, DEFAULT_CATEGORIES, DEFAULT_ENGINES } from './seed-data.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.NAVPAGE_DATA_DIR || path.join(ROOT, 'data');

mkdirSync(DATA_DIR, { recursive: true });

export const DB_FILE = path.join(DATA_DIR, 'navpage.db');
const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
`);

/* ---------------- 建表 ---------------- */

function createAuthTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_meta (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name  TEXT NOT NULL DEFAULT '',
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
  `);
}

function createContentTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      id       TEXT NOT NULL,
      name     TEXT NOT NULL,
      icon     TEXT NOT NULL DEFAULT '📁',
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS sites (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      url         TEXT NOT NULL,
      description TEXT,
      category_id TEXT NOT NULL,
      color       TEXT,
      icon        TEXT,
      hot         INTEGER NOT NULL DEFAULT 0,
      position    INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (user_id, url),
      FOREIGN KEY (user_id, category_id) REFERENCES categories (user_id, id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS engines (
      user_id  INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      id       TEXT NOT NULL,
      name     TEXT NOT NULL,
      url      TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, id)
    );

    CREATE TABLE IF NOT EXISTS pins (
      user_id    INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      url        TEXT NOT NULL,
      position   INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (user_id, url)
    );

    CREATE TABLE IF NOT EXISTS preferences (
      user_id INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      key     TEXT NOT NULL,
      value   TEXT NOT NULL,
      PRIMARY KEY (user_id, key)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name ON categories (user_id, name);
    CREATE INDEX IF NOT EXISTS idx_sites_category ON sites (user_id, category_id, position);
  `);
}

/* ---------------- 事务 ---------------- */

let depth = 0;

/** 同步事务封装：支持嵌套调用，出错自动回滚 */
function transaction(fn) {
  if (depth > 0) return fn();

  db.exec('BEGIN IMMEDIATE');
  depth += 1;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    depth -= 1;
  }
}

/* ---------------- 元信息 ---------------- */

export function getMeta(key) {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key);
  return row ? row.value : '';
}

export function setMeta(key, value) {
  db.prepare(
    'INSERT INTO app_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, String(value));
}

export function deleteMeta(key) {
  db.prepare('DELETE FROM app_meta WHERE key = ?').run(key);
}

/* ---------------- 账号 / 会话 ---------------- */

const toUser = (row) => ({
  id: Number(row.id),
  username: row.username,
  displayName: row.display_name || row.username,
  role: row.role === 'admin' ? 'admin' : 'user',
  createdAt: row.created_at
});

export function countUsers() {
  return Number(db.prepare('SELECT COUNT(*) AS n FROM users').get().n);
}

/** 超级管理员数量，用于防止把最后一个管理员删掉 / 降级 */
export function countAdmins() {
  return Number(db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n);
}

/** 用户列表（仅管理员可见），附带站点数量 */
export function listUsers() {
  return db
    .prepare(
      `SELECT u.*, (SELECT COUNT(*) FROM sites s WHERE s.user_id = u.id) AS site_count
       FROM users u
       ORDER BY CASE u.role WHEN 'admin' THEN 0 ELSE 1 END, u.id ASC`
    )
    .all()
    .map((row) => ({ ...toUser(row), siteCount: Number(row.site_count) }));
}

export function findUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) ?? null;
}

/** 带密码哈希的原始记录，仅认证流程使用 */
export function getUserSecret(id) {
  return db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(id) ?? null;
}

export function getUser(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? toUser(row) : null;
}

export function createUser({ username, password, displayName, role = 'user' }) {
  const result = db
    .prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
    .run(username, hashPassword(password), displayName || username, role === 'admin' ? 'admin' : 'user');
  const user = getUser(Number(result.lastInsertRowid));
  seedUserContent(user.id);
  return user;
}

/** 删除账号：会话与内容由外键级联清理 */
export function deleteUser(id) {
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return result.changes > 0;
}

export function updateUserRole(id, role) {
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role === 'admin' ? 'admin' : 'user', id);
  return getUser(id);
}

export function updateUserProfile(id, { displayName }) {
  db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run(displayName || '', id);
  return getUser(id);
}

export function updateUserPassword(id, password) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(password), id);
  return getUser(id);
}

export function createSession(userId, tokenHash, expiresAt) {
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    tokenHash,
    userId,
    expiresAt
  );
}

/** 用 token 哈希换用户；过期会话直接删除 */
export function findSessionUser(tokenHash) {
  const row = db
    .prepare(
      `SELECT u.*, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .get(tokenHash);
  if (!row) return null;

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
    return null;
  }
  return toUser(row);
}

export function deleteSession(tokenHash) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash);
}

export function deleteUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

export function deleteExpiredSessions() {
  return db.prepare("DELETE FROM sessions WHERE expires_at <= datetime('now')").run().changes;
}

/* ---------------- 分类 ---------------- */

const toCategory = (row) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  position: Number(row.position)
});

const nextPosition = (table, userId, where = '', value) => {
  const sql = `SELECT COALESCE(MAX(position), -1) + 1 AS next FROM ${table} WHERE user_id = ?${where}`;
  const params = where ? [userId, value] : [userId];
  const row = db.prepare(sql).get(...params);
  return Number(row.next);
};

export function listCategories(userId) {
  return db
    .prepare('SELECT * FROM categories WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId)
    .map(toCategory);
}

export function getCategory(userId, id) {
  const row = db.prepare('SELECT * FROM categories WHERE user_id = ? AND id = ?').get(userId, id);
  return row ? toCategory(row) : null;
}

export function insertCategory(userId, { name, icon }) {
  const id = `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  db.prepare('INSERT INTO categories (user_id, id, name, icon, position) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    id,
    name,
    icon || '📁',
    nextPosition('categories', userId)
  );
  return getCategory(userId, id);
}

export function updateCategory(userId, id, patch) {
  const current = getCategory(userId, id);
  if (!current) return null;
  db.prepare('UPDATE categories SET name = ?, icon = ? WHERE user_id = ? AND id = ?').run(
    patch.name ?? current.name,
    patch.icon ?? current.icon,
    userId,
    id
  );
  return getCategory(userId, id);
}

/** 删除分类：站点可迁移到 moveTo，否则一并删除 */
export function deleteCategory(userId, id, { moveTo = null, force = false } = {}) {
  const current = getCategory(userId, id);
  if (!current) return null;

  const { n } = db
    .prepare('SELECT COUNT(*) AS n FROM sites WHERE user_id = ? AND category_id = ?')
    .get(userId, id);

  return transaction(() => {
    if (n > 0) {
      if (moveTo) {
        db.prepare('UPDATE sites SET category_id = ? WHERE user_id = ? AND category_id = ?').run(
          moveTo,
          userId,
          id
        );
      } else if (force) {
        db.prepare('DELETE FROM sites WHERE user_id = ? AND category_id = ?').run(userId, id);
      } else {
        throw Object.assign(new Error('该分类下还有站点'), { status: 409 });
      }
    }
    db.prepare('DELETE FROM categories WHERE user_id = ? AND id = ?').run(userId, id);
    return { deleted: id, movedSites: moveTo ? Number(n) : 0, removedSites: moveTo ? 0 : Number(n) };
  });
}

export function reorderCategories(userId, ids) {
  const update = db.prepare('UPDATE categories SET position = ? WHERE user_id = ? AND id = ?');
  transaction(() => ids.forEach((id, index) => update.run(index, userId, id)));
  return listCategories(userId);
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

export function listSites(userId) {
  return db
    .prepare(
      `SELECT s.* FROM sites s
       JOIN categories c ON c.user_id = s.user_id AND c.id = s.category_id
       WHERE s.user_id = ?
       ORDER BY c.position ASC, s.position ASC, s.id ASC`
    )
    .all(userId)
    .map(toSite);
}

export function getSite(userId, id) {
  const row = db.prepare('SELECT * FROM sites WHERE user_id = ? AND id = ?').get(userId, id);
  return row ? toSite(row) : null;
}

export function findSiteByUrl(userId, url) {
  const row = db.prepare('SELECT * FROM sites WHERE user_id = ? AND url = ?').get(userId, url);
  return row ? toSite(row) : null;
}

export function insertSite(userId, { name, url, desc, categoryId, color, icon, hot = false }) {
  const position = nextPosition('sites', userId, ' AND category_id = ?', categoryId);
  const result = db
    .prepare(
      `INSERT INTO sites (user_id, name, url, description, category_id, color, icon, hot, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(userId, name, url, desc || null, categoryId, color || null, icon || null, hot ? 1 : 0, position);

  return getSite(userId, Number(result.lastInsertRowid));
}

export function updateSite(userId, id, patch) {
  const current = getSite(userId, id);
  if (!current) return null;

  const categoryId = patch.categoryId ?? current.categoryId;
  const movedCategory = categoryId !== current.categoryId;
  const position = movedCategory
    ? nextPosition('sites', userId, ' AND category_id = ?', categoryId)
    : current.position;

  db.prepare(
    `UPDATE sites
       SET name = ?, url = ?, description = ?, category_id = ?, color = ?, icon = ?, position = ?
     WHERE user_id = ? AND id = ?`
  ).run(
    patch.name ?? current.name,
    patch.url ?? current.url,
    patch.desc ?? current.desc,
    categoryId,
    patch.color === undefined ? current.color ?? null : patch.color || null,
    patch.icon === undefined ? current.icon ?? null : patch.icon || null,
    position,
    userId,
    id
  );

  // 网址变了，收藏里指向旧地址的记录要跟着改，否则「常用」会丢
  if (current.url !== (patch.url ?? current.url)) {
    db.prepare('UPDATE OR REPLACE pins SET url = ? WHERE user_id = ? AND url = ?').run(
      patch.url,
      userId,
      current.url
    );
  }

  return getSite(userId, id);
}

export function deleteSite(userId, id) {
  const site = getSite(userId, id);
  if (!site) return false;
  transaction(() => {
    db.prepare('DELETE FROM sites WHERE user_id = ? AND id = ?').run(userId, id);
    db.prepare('DELETE FROM pins WHERE user_id = ? AND url = ?').run(userId, site.url);
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

export function listEngines(userId) {
  return db
    .prepare('SELECT * FROM engines WHERE user_id = ? ORDER BY position ASC, id ASC')
    .all(userId)
    .map(toEngine);
}

export function getEngine(userId, id) {
  const row = db.prepare('SELECT * FROM engines WHERE user_id = ? AND id = ?').get(userId, id);
  return row ? toEngine(row) : null;
}

export function insertEngine(userId, { name, url }) {
  const id = `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  db.prepare('INSERT INTO engines (user_id, id, name, url, position) VALUES (?, ?, ?, ?, ?)').run(
    userId,
    id,
    name,
    url,
    nextPosition('engines', userId)
  );
  return getEngine(userId, id);
}

export function updateEngine(userId, id, patch) {
  const current = getEngine(userId, id);
  if (!current) return null;
  db.prepare('UPDATE engines SET name = ?, url = ? WHERE user_id = ? AND id = ?').run(
    patch.name ?? current.name,
    patch.url ?? current.url,
    userId,
    id
  );
  return getEngine(userId, id);
}

export function deleteEngine(userId, id) {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM engines WHERE user_id = ?').get(userId);
  if (n <= 1) throw Object.assign(new Error('至少要保留一个搜索引擎'), { status: 409 });
  return db.prepare('DELETE FROM engines WHERE user_id = ? AND id = ?').run(userId, id).changes > 0;
}

/* ---------------- 「常用」收藏 ---------------- */

export function listPins(userId) {
  return db
    .prepare('SELECT url FROM pins WHERE user_id = ? ORDER BY position ASC, created_at ASC')
    .all(userId)
    .map((row) => row.url);
}

/** 用给定列表整体替换收藏（顺序即展示顺序），事务保证原子性 */
export function replacePins(userId, urls) {
  const removeAll = db.prepare('DELETE FROM pins WHERE user_id = ?');
  const insert = db.prepare('INSERT INTO pins (user_id, url, position) VALUES (?, ?, ?)');

  transaction(() => {
    removeAll.run(userId);
    urls.forEach((url, index) => insert.run(userId, url, index));
  });

  return listPins(userId);
}

/** 推荐站点（出厂数据里标记 hot 的，且现在仍存在） */
export function listHotUrls(userId) {
  return db
    .prepare('SELECT url FROM sites WHERE user_id = ? AND hot = 1 ORDER BY id ASC')
    .all(userId)
    .map((row) => row.url);
}

/* ---------------- 偏好设置 ---------------- */

export function getPreferences(userId) {
  const rows = db.prepare('SELECT key, value FROM preferences WHERE user_id = ?').all(userId);
  const prefs = {};
  rows.forEach((row) => {
    prefs[row.key] = row.value;
  });
  return prefs;
}

export function savePreferences(userId, patch) {
  const upsert = db.prepare(
    `INSERT INTO preferences (user_id, key, value) VALUES (?, ?, ?)
     ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`
  );

  transaction(() => {
    Object.entries(patch).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      upsert.run(userId, key, String(value));
    });
  });

  return getPreferences(userId);
}

/* ---------------- 出厂内容 ---------------- */

function writeDefaults(userId) {
  const insertCategory = db.prepare(
    'INSERT INTO categories (user_id, id, name, icon, position) VALUES (?, ?, ?, ?, ?)'
  );
  const insertSite = db.prepare(
    `INSERT OR IGNORE INTO sites (user_id, name, url, description, category_id, color, icon, hot, position)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertEngine = db.prepare(
    'INSERT INTO engines (user_id, id, name, url, position) VALUES (?, ?, ?, ?, ?)'
  );

  DEFAULT_CATEGORIES.forEach((category, categoryIndex) => {
    insertCategory.run(userId, category.id, category.name, category.icon, categoryIndex);
    category.sites.forEach((site, siteIndex) => {
      insertSite.run(
        userId,
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
    insertEngine.run(userId, `e${index + 1}`, engine.name, engine.url, index);
  });
}

/** 为新账号写入出厂内容 + 默认收藏 + 默认偏好 */
export function seedUserContent(userId) {
  transaction(() => {
    const { n } = db.prepare('SELECT COUNT(*) AS n FROM categories WHERE user_id = ?').get(userId);
    if (Number(n) > 0) return;

    writeDefaults(userId);
    replacePins(userId, listHotUrls(userId));
    savePreferences(userId, {
      seeded: 'true',
      engine: listEngines(userId)[0]?.id || '',
      theme: 'light',
      ...DEFAULT_APPEARANCE
    });
  });
}

/** 恢复出厂：清空该账号的内容与收藏，重新写入出厂数据 */
export function resetAll(userId) {
  transaction(() => {
    db.prepare('DELETE FROM pins WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM sites WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM categories WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM engines WHERE user_id = ?').run(userId);

    writeDefaults(userId);
    replacePins(userId, listHotUrls(userId));
    savePreferences(userId, {
      seeded: 'true',
      engine: listEngines(userId)[0]?.id || '',
      theme: 'light',
      ...DEFAULT_APPEARANCE
    });
  });

  return true;
}

/** 全量快照，用于导出备份 */
export function exportAll(userId) {
  const user = getUser(userId);
  return {
    version: 4,
    exportedAt: new Date().toISOString(),
    account: { username: user?.username ?? '', displayName: user?.displayName ?? '' },
    categories: listCategories(userId),
    sites: listSites(userId),
    engines: listEngines(userId),
    pins: listPins(userId),
    preferences: getPreferences(userId)
  };
}

/* ---------------- 结构与旧数据迁移 ---------------- */

const tableExists = (name) =>
  Boolean(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));

const hasColumn = (table, column) =>
  db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .some((row) => row.name === column);

/** v3 单用户库 → v4 多用户库：数据整体归入默认账号 */
function migrateFromV3() {
  const adminUsername = process.env.NAVPAGE_ADMIN_USER || 'admin';
  const adminPassword = process.env.NAVPAGE_ADMIN_PASSWORD || 'admin123';

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    transaction(() => {
      db.exec(`
        ALTER TABLE categories RENAME TO v3_categories;
        ALTER TABLE sites RENAME TO v3_sites;
        ALTER TABLE engines RENAME TO v3_engines;
        ALTER TABLE pins RENAME TO v3_pins;
        ALTER TABLE preferences RENAME TO v3_preferences;
      `);

      // 旧索引名与新表索引同名，先删掉，否则 IF NOT EXISTS 会跳过创建
      db.exec(`
        DROP INDEX IF EXISTS idx_categories_name;
        DROP INDEX IF EXISTS idx_sites_category;
      `);

      createContentTables();

      const result = db
        .prepare(
          "INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, 'admin')"
        )
        .run(adminUsername, hashPassword(adminPassword), '管理员');
      const userId = Number(result.lastInsertRowid);

      db.prepare(
        `INSERT INTO categories (user_id, id, name, icon, position)
         SELECT ?, id, name, icon, position FROM v3_categories`
      ).run(userId);

      db.prepare(
        `INSERT INTO sites (id, user_id, name, url, description, category_id, color, icon, hot, position, created_at)
         SELECT id, ?, name, url, description, category_id, color, icon, hot, position, created_at FROM v3_sites`
      ).run(userId);

      db.prepare(
        'INSERT INTO engines (user_id, id, name, url, position) SELECT ?, id, name, url, position FROM v3_engines'
      ).run(userId);

      db.prepare('INSERT INTO pins (user_id, url, position, created_at) SELECT ?, url, position, created_at FROM v3_pins').run(
        userId
      );

      db.prepare(
        'INSERT INTO preferences (user_id, key, value) SELECT ?, key, value FROM v3_preferences'
      ).run(userId);

      // v2 时代的自定义站点表
      if (tableExists('custom_sites')) {
        const rows = db.prepare('SELECT * FROM custom_sites').all();
        const categoryIds = new Set(listCategories(userId).map((item) => item.id));
        rows.forEach((row) => {
          if (!categoryIds.has(row.category_id)) return;
          if (findSiteByUrl(userId, row.url)) return;
          insertSite(userId, {
            name: row.name,
            url: row.url,
            desc: row.description ?? '',
            categoryId: row.category_id,
            color: row.color ?? undefined
          });
        });
        db.exec('DROP TABLE custom_sites');
      }

      db.exec(`
        DROP TABLE v3_sites;
        DROP TABLE v3_categories;
        DROP TABLE v3_engines;
        DROP TABLE v3_pins;
        DROP TABLE v3_preferences;
      `);

      setMeta('legacy_account', JSON.stringify({ username: adminUsername, password: adminPassword }));
    });
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }

  console.log(`[db] 已把旧版单用户数据迁移到账号「${adminUsername}」`);
}

createAuthTables();

if (tableExists('categories') && !hasColumn('categories', 'user_id')) {
  migrateFromV3();
} else {
  createContentTables();
}

/**
 * v4 早期建库没有 role 字段：补上并把最早的账号提升为超级管理员。
 * 这样老用户升级后仍有人能管理账号，不会被锁在门外。
 */
function ensureUserRoles() {
  if (!hasColumn('users', 'role')) {
    db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
  if (countAdmins() === 0 && countUsers() > 0) {
    const first = db.prepare('SELECT id FROM users ORDER BY id ASC LIMIT 1').get();
    if (first) {
      db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(first.id);
      console.log(`[db] 已把账号 #${first.id} 提升为超级管理员`);
    }
  }
}

ensureUserRoles();

/** 服务启动时调用：清理过期会话 */
export function ensureInitialized() {
  const removed = deleteExpiredSessions();
  if (removed > 0) console.log(`[db] 清理过期会话 ${removed} 条`);
}

export default db;
