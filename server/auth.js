/**
 * 认证工具
 * ------------------------------------------------------------------
 * · 密码：scrypt + 随机盐，存储格式 `scrypt$<salt>$<hash>`
 * · 会话：32 字节随机 token，数据库里只存 sha256（即使库泄露也拿不到可用 token）
 * · Cookie：HttpOnly + SameSite=Lax，默认 30 天
 * · 限流：同一 IP + 账号 10 分钟内失败 8 次即短暂锁定
 */
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'nv_session';
export const SESSION_TTL_DAYS = Number(process.env.NAVPAGE_SESSION_DAYS) || 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;

/** 密码哈希 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

/** 校验密码（长度不一致时也走一次 scrypt，避免通过耗时差异探测账号） */
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;

  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length || 64);
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export const newSessionToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token) => createHash('sha256').update(token).digest('hex');
export const sessionExpiry = () => new Date(Date.now() + SESSION_TTL_MS).toISOString();

/** 极简 Cookie 解析（只需读一个值，不引三方依赖） */
export function parseCookies(header = '') {
  const map = {};
  String(header)
    .split(';')
    .forEach((part) => {
      const index = part.indexOf('=');
      if (index < 0) return;
      const key = part.slice(0, index).trim();
      if (!key) return;
      map[key] = decodeURIComponent(part.slice(index + 1).trim());
    });
  return map;
}

export const readSessionToken = (req) => parseCookies(req.headers.cookie)[SESSION_COOKIE] || '';

export function sessionCookie(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}`;
}

export const clearSessionCookie = () =>
  `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;

/* ---------------- 登录失败限流 ---------------- */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_FAILURES = 8;
const attempts = new Map();

export function assertLoginAllowed(key) {
  const entry = attempts.get(key);
  if (!entry) return;
  if (Date.now() - entry.first > WINDOW_MS) {
    attempts.delete(key);
    return;
  }
  if (entry.count >= MAX_FAILURES) {
    const seconds = Math.max(1, Math.ceil((entry.first + WINDOW_MS - Date.now()) / 1000));
    throw Object.assign(new Error(`尝试次数过多，请 ${seconds} 秒后再试`), { status: 429 });
  }
}

export function noteLoginFailure(key) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.first > WINDOW_MS) {
    attempts.set(key, { count: 1, first: Date.now() });
    return;
  }
  entry.count += 1;
}

export const clearLoginFailures = (key) => attempts.delete(key);
