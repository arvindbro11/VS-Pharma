/**
 * auth.js — password hashing + cookie session handling (no external libraries)
 */
const crypto = require('node:crypto');
const db = require('./db');

const SESSION_DAYS = 7;
const COOKIE = 'vs_sid';

/* ---------- passwords ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const test = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/* ---------- cookies ---------- */
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isHttps(req) {
  if (!req) return false;
  const proto = String(req.headers?.['x-forwarded-proto'] || '').split(',')[0].trim();
  return proto === 'https' || Boolean(req.socket && req.socket.encrypted);
}

function setSessionCookie(req, res, token) {
  // Cross-site embeds (iframes) only keep the cookie with SameSite=None + Secure.
  const sameSite = isHttps(req) ? 'None; Secure' : 'Lax';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; SameSite=${sameSite}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

/** Reads the session token from the cookie, or from an Authorization Bearer header. */
function tokenFromRequest(req) {
  const fromCookie = parseCookies(req)[COOKIE];
  if (fromCookie) return fromCookie;
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return null;
}

/* ---------- sessions ---------- */
function createSession(req, res, user) {
  const token = crypto.randomBytes(24).toString('hex');
  const rows = db.read('sessions');
  rows.push({
    id: rows.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1,
    token,
    userId: user.id,
    role: user.role,
    createdAt: new Date().toISOString(),
  });
  db.write('sessions', rows);
  setSessionCookie(req, res, token);
  return token;
}

function destroySession(req, res) {
  const token = tokenFromRequest(req);
  if (token) db.write('sessions', db.read('sessions').filter((s) => s.token !== token));
  clearSessionCookie(res);
}

/** Returns the logged-in user object (without password) or null. */
function currentUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const session = db.read('sessions').find((s) => s.token === token);
  if (!session) return null;
  const user = db.read('users').find((u) => u.id === session.userId);
  if (!user) return null;
  return publicUser(user);
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

module.exports = {
  tokenFromRequest,
  hashPassword,
  verifyPassword,
  parseCookies,
  createSession,
  destroySession,
  currentUser,
  publicUser,
};
