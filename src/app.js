/**
 * app.js — one request handler shared by BOTH runtimes:
 *   • local / VPS : server.js  ->  http.createServer(app).listen(3000)
 *   • Vercel      : api/[...path].js  ->  module.exports = app
 *
 * It serves the REST API (/api/...) and, when running as a normal server,
 * the static files from public/. (On Vercel the CDN serves public/ instead.)
 */
const fs = require('node:fs');
const path = require('node:path');

const db = require('./db');
const seed = require('./seed');
const { currentUser } = require('./auth');
const api = require('./api');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

/* ---------- one-time bootstrap (data files + demo seed) ---------- */
let bootstrapped = false;
function bootstrap() {
  if (bootstrapped) return;
  bootstrapped = true;
  try {
    db.ensureData();
    seed();
  } catch (err) {
    // never let a storage hiccup crash the whole function
    console.error('[bootstrap]', err.message);
  }
}

/* ---------- helpers ---------- */
function sendJson(res, status, payload, extraHeaders = {}) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    ...extraHeaders,
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    // Vercel already parses JSON bodies when Content-Type is application/json
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      return resolve(req.body);
    }
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 2_000_000) reject(new Error('Payload too large'));
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  if (rel === '/admin') rel = '/admin.html';
  if (rel === '/login') rel = '/login.html';
  if (rel === '/account') rel = '/account.html';
  if (rel === '/theme') rel = '/theme.html';

  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, buf) => {
    if (err) {
      if (!path.extname(rel)) {
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, home) => {
          if (e2) return res.writeHead(404).end('Not found');
          res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-store, max-age=0' });
          res.end(home);
        });
        return;
      }
      return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    const fresh = ['.html', '.css', '.js', '.json'].includes(ext);
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': fresh ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=86400',
      'X-Theme': 'onyx-and-gold-v4',
    });
    res.end(buf);
  });
}

/* ---------- the handler ---------- */
async function app(req, res) {
  bootstrap();

  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    return res.end();
  }

  // Anything that is not an API call is a static asset (local dev only —
  // on Vercel the file is served by the CDN before it reaches this function).
  if (!url.pathname.startsWith('/api/') && url.pathname !== '/api') {
    return serveStatic(req, res, url.pathname);
  }

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const user = currentUser(req);
    const result = await api.handle(req, res, url, body, user);
    const { status = 200, body: payload = {} } = result || {};
    const cookie = res.getHeader('Set-Cookie');
    return sendJson(res, status, payload, cookie ? { 'Set-Cookie': cookie } : {});
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api error]', err);
    const cookie = res.getHeader('Set-Cookie');
    const headers = { 'Content-Type': 'application/json; charset=utf-8', ...(cookie ? { 'Set-Cookie': cookie } : {}) };
    res.writeHead(status, headers);
    res.end(JSON.stringify({ error: err.message || 'Server error' }));
  }
}

app.bootstrap = bootstrap;
app.PUBLIC_DIR = PUBLIC_DIR;
module.exports = app;
