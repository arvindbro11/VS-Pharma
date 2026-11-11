/**
 * db.js — tiny JSON storage layer (one separate file per collection)
 * ------------------------------------------------------------------
 * Every record type is saved in its OWN file so records never mix:
 *   users.json      -> customer + admin accounts
 *   products.json   -> medicine inventory
 *   orders.json     -> online purchases made by customers
 *   sales.json      -> counter sales entered by the admin
 *   purchases.json  -> goods bought from suppliers (debit)
 *   ledger.json     -> credit / debit (udhaar khata) register
 *   sessions.json   -> active login sessions
 *
 * The folder is chosen at runtime:
 *   • local / VPS  -> ./data          (env VS_DATA_DIR can override)
 *   • serverless   -> /tmp/vs-pharma-data  (Vercel's disk is read-only + ephemeral)
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const COLLECTIONS = [
  'users',
  'products',
  'orders',
  'sales',
  'purchases',
  'ledger',
  'sessions',
];

let resolvedDir = null;
let usedFallback = false;

/** Returns a writable data directory, falling back to the OS temp dir. */
function dataDir() {
  if (resolvedDir) return resolvedDir;
  const preferred = process.env.VS_DATA_DIR || path.join(__dirname, '..', 'data');
  try {
    fs.mkdirSync(preferred, { recursive: true });
    fs.accessSync(preferred, fs.constants.W_OK);
    resolvedDir = preferred;
  } catch (err) {
    const fallback = path.join(os.tmpdir(), 'vs-pharma-data');
    fs.mkdirSync(fallback, { recursive: true });
    usedFallback = true;
    console.warn(`[db] "${preferred}" is not writable (${err.code || err.message}) — using ${fallback}`);
    resolvedDir = fallback;
  }
  return resolvedDir;
}

function fileOf(name) {
  if (!COLLECTIONS.includes(name)) throw new Error('Unknown collection: ' + name);
  return path.join(dataDir(), name + '.json');
}

function ensureData() {
  for (const name of COLLECTIONS) {
    const f = fileOf(name);
    if (!fs.existsSync(f)) fs.writeFileSync(f, '[]\n', 'utf8');
  }
}

function read(name) {
  ensureData();
  try {
    const raw = fs.readFileSync(fileOf(name), 'utf8').trim();
    if (!raw) return [];
    const rows = JSON.parse(raw);
    return Array.isArray(rows) ? rows : [];
  } catch (err) {
    console.error(`[db] could not read ${name}.json ->`, err.message);
    return [];
  }
}

/** Atomic write: write to .tmp then rename, so a crash never corrupts data. */
function write(name, rows) {
  const payload = JSON.stringify(rows, null, 2) + '\n';
  const attempt = (file) => {
    fs.writeFileSync(file + '.tmp', payload, 'utf8');
    fs.renameSync(file + '.tmp', file);
  };
  try {
    attempt(fileOf(name));
  } catch (err) {
    if (usedFallback) throw err;
    // read-only filesystem discovered at write time (e.g. a serverless runtime)
    const fallback = path.join(os.tmpdir(), 'vs-pharma-data');
    fs.mkdirSync(fallback, { recursive: true });
    console.warn(`[db] write failed (${err.code || err.message}) — switching storage to ${fallback}`);
    resolvedDir = fallback;
    usedFallback = true;
    const target = fileOf(name);
    if (!fs.existsSync(target)) fs.writeFileSync(target, '[]\n', 'utf8');
    attempt(target);
  }
  return rows;
}

function insert(name, row) {
  const rows = read(name);
  const id = rows.reduce((max, r) => Math.max(max, Number(r.id) || 0), 0) + 1;
  const record = { id, ...row, createdAt: row.createdAt || new Date().toISOString() };
  rows.push(record);
  write(name, rows);
  return record;
}

function update(name, id, patch) {
  const rows = read(name);
  const i = rows.findIndex((r) => Number(r.id) === Number(id));
  if (i === -1) return null;
  rows[i] = { ...rows[i], ...patch, id: rows[i].id, updatedAt: new Date().toISOString() };
  write(name, rows);
  return rows[i];
}

function remove(name, id) {
  const rows = read(name);
  const next = rows.filter((r) => Number(r.id) !== Number(id));
  write(name, next);
  return next.length !== rows.length;
}

module.exports = {
  COLLECTIONS,
  dataDir,
  ensureData,
  read,
  write,
  insert,
  update,
  remove,
  get isEphemeral() { return usedFallback; },
};
