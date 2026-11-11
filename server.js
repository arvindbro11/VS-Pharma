/**
 * server.js — LOCAL / VPS entry point.
 *   node server.js   →  http://localhost:3000
 *
 * Vercel does NOT run this file: there the API is served by api/[...path].js
 * and the pages/styles by the static CDN from public/.
 */
const http = require('node:http');
const app = require('./src/app');
const db = require('./src/db');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const server = http.createServer((req, res) => {
  Promise.resolve(app(req, res)).catch((err) => {
    console.error('[fatal]', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Server error' }));
  });
});

app.bootstrap();

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║   VS PHARMA & MEDICAL STORE  —  Website running      ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log(`   Store   : http://localhost:${PORT}`);
  console.log(`   Login   : http://localhost:${PORT}/login.html`);
  console.log(`   Admin   : http://localhost:${PORT}/admin.html`);
  console.log(`   Theme   : http://localhost:${PORT}/theme.html`);
  console.log('   Admin login  : admin@vspharmacy.in / admin123');
  console.log('   Customer     : rahul@example.com / user123');
  console.log(`   Data files   : ${db.dataDir()}${db.isEphemeral ? '  (temporary — read-only disk)' : ''}`);
  console.log('');
});
