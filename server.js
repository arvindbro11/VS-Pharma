/**
 * ============================================================
 *  VS PHARMA & MEDICAL STORE — website server
 *  Run:  node server.js      then open http://localhost:3000
 *  No npm install needed — only built-in Node.js modules.
 * ============================================================
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const db = require('./src/db');
const seed = require('./src/seed');
const { currentUser } = require('./src/auth');
const api = require('./src/api');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';
const PUBLIC_DIR = path.join(__dirname, 'public');

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

function sendJson(res, status, payload) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
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

  const filePath = path.join(PUBLIC_DIR, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      // SPA-ish fallback: unknown page -> storefront
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
      // theme edits must show up immediately in the browser / preview pane
      'Cache-Control': fresh ? 'no-store, no-cache, must-revalidate, max-age=0' : 'public, max-age=86400',
      Pragma: fresh ? 'no-cache' : undefined,
      Expires: fresh ? '0' : undefined,
      'X-Theme': 'onyx-and-gold-v4',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    });
    return res.end();
  }

  if (!url.pathname.startsWith('/api/')) {
    return serveStatic(req, res, url.pathname);
  }

  try {
    const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readBody(req) : {};
    const user = currentUser(req);
    const result = await api.handle(req, res, url, body, user);
    const { status = 200, body: payload = {} } = result || {};
    const extra = res.getHeader('Set-Cookie') ? { 'Set-Cookie': res.getHeader('Set-Cookie') } : {};
    const data = JSON.stringify(payload);
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...extra,
    });
    res.end(data);
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[api error]', err);
    const extra = res.getHeader('Set-Cookie') ? { 'Set-Cookie': res.getHeader('Set-Cookie') } : {};
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extra });
    res.end(JSON.stringify({ error: err.message || 'Server error' }));
  }
});

db.ensureData();
seed();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║   VS PHARMA & MEDICAL STORE  —  Website running      ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log(`   Store   : http://localhost:${PORT}`);
  console.log(`   Login   : http://localhost:${PORT}/login.html`);
  console.log(`   Admin   : http://localhost:${PORT}/admin.html`);
  console.log('   Admin login  : admin@vspharmacy.in / admin123');
  console.log('   Customer     : rahul@example.com / user123');
  console.log(`   Data files   : ${db.DATA_DIR}`);
  console.log('');
});
