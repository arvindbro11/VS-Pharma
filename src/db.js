/**
 * db.js — tiny JSON storage layer (one separate file per collection)
 * ------------------------------------------------------------------
 * Every record type is saved in its OWN file so records never mix:
 *   data/users.json      -> customer + admin accounts
 *   data/products.json   -> medicine inventory
 *   data/orders.json     -> online purchases made by customers
 *   data/sales.json      -> counter sales entered by the admin
 *   data/purchases.json  -> goods bought from suppliers (debit)
 *   data/ledger.json     -> credit / debit (udhaar khata) register
 *   data/sessions.json   -> active login sessions
 */
const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const COLLECTIONS = [
  'users',
  'products',
  'orders',
  'sales',
  'purchases',
  'ledger',
  'sessions',
];

function fileOf(name) {
  if (!COLLECTIONS.includes(name)) throw new Error('Unknown collection: ' + name);
  return path.join(DATA_DIR, name + '.json');
}

function ensureData() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
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
  ensureData();
  const target = fileOf(name);
  const tmp = target + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(rows, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, target);
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

module.exports = { DATA_DIR, COLLECTIONS, ensureData, read, write, insert, update, remove };
