/**
 * Vercel serverless entry point.
 * Catches every request under /api/* and hands it to the shared app handler,
 * so the same routes work locally (server.js) and on Vercel (this function).
 */
const app = require('../src/app');

module.exports = async function handler(req, res) {
  // Normally req.url is already "/api/...". If the platform hands us the
  // catch-all destination instead, rebuild the path from the route params.
  if (!req.url || !req.url.startsWith('/api')) {
    const seg = req.query && req.query.path;
    const tail = Array.isArray(seg) ? seg.join('/') : String(seg || '');
    const qs = req.url && req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
    req.url = '/api' + (tail ? '/' + tail : '') + qs;
  }
  return app(req, res);
};
