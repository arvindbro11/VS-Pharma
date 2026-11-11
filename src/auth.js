/**
 * auth.js — password hashing + STATELESS session tokens
 * ------------------------------------------------------
 * Sessions are signed (HMAC-SHA256) tokens, NOT rows in a database.
 * Why: on serverless hosts (Vercel) each instance has its own throwaway
 * /tmp, so a session written by one instance is invisible to the next one —
 * that is what caused "Please login first" right after logging in.
 * A signed token needs no storage, so it works on any instance, any cold start.
 *
 * Token format:  base64url(payload) + "." + base64url(hmac)
 * The token travels as a cookie AND/OR as "Authorization: Bearer <token>".
 */
const crypto = require('node:crypto');
const db = require('./db');

const SESSION_DAYS = 7;
const COOKIE = 'vs_sid';
const SECRET = process.env.AUTH_SECRET || 'vs-pharma-dev-secret-change-me';

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

/* ---------- signed tokens ---------- */
const b64 = (buf) => Buffer.from(buf).toString('base64url');
const unb64 = (str) => Buffer.from(str, 'base64url').toString('utf8');

function signToken(user) {
  const payload = {
    uid: user.id,
    role: user.role,
    iat: Date.now(),
    exp: Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000,
  };
  const body = b64(JSON.stringify(payload));
  const sig = b64(crypto.createHmac('sha256', SECRET).update(body).digest());
  return `${body}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const expected = b64(crypto.createHmac('sha256', SECRET).update(body).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(unb64(body));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ---------- cookies ---------- */
function parseCookies(req) {
  const out = {};
  const header = (req && req.headers && req.headers.cookie) || '';
  header.split(';').forEach((part) => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function isHttps(req) {
  if (!req) return false;
  const proto = String((req.headers && req.headers['x-forwarded-proto']) || '').split(',')[0].trim();
  return proto === 'https' || Boolean(req.socket && req.socket.encrypted);
}

function setSessionCookie(req, res, token) {
  // Cross-site embeds only keep cookies with SameSite=None; Secure.
  const sameSite = isHttps(req) ? 'None; Secure' : 'Lax';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 24 * 60 * 60}; SameSite=${sameSite}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
}

/* ---------- session helpers ---------- */
/** Reads the token from the cookie, or from an Authorization: Bearer header. */
function tokenFromRequest(req) {
  const fromCookie = parseCookies(req)[COOKIE];
  if (fromCookie) return fromCookie;
  const header = req && req.headers && (req.headers.authorization || req.headers.Authorization);
  if (header && /^Bearer\s+/i.test(header)) return header.replace(/^Bearer\s+/i, '').trim();
  return null;
}

function createSession(req, res, user) {
  const token = signToken(user);
  setSessionCookie(req, res, token);
  return token; // stateless: nothing is written to disk
}

function destroySession(req, res) {
  // Nothing to delete server-side: the token simply expires. The browser
  // discards its copy (cookie + stored token), which is the real logout.
  clearSessionCookie(res);
}

function currentUser(req) {
  const token = tokenFromRequest(req);
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload) return null;
  const user = db.read('users').find((u) => u.id === payload.uid);
  if (!user) return null;
  return publicUser(user);
}

function publicUser(u) {
  if (!u) return null;
  const { passwordHash, ...safe } = u;
  return safe;
}

module.exports = {
  SESSION_DAYS,
  tokenFromRequest,
  verifyToken,
  hashPassword,
  verifyPassword,
  parseCookies,
  createSession,
  destroySession,
  currentUser,
  publicUser,
};
