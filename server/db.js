const path = require('path');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'mining.db');

// Use Node's built-in SQLite (Node >= 22.5, --experimental-sqlite).
// API mirrors better-sqlite3 closely (prepare/get/all/run/exec).
let DatabaseSync;
try {
  ({ DatabaseSync } = require('node:sqlite'));
} catch (e) {
  throw new Error(
    'node:sqlite 不可用。请使用 Node.js >= 22.5 并通过 `npm start` (带 --experimental-sqlite) 启动。'
  );
}
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');

// --- schema -----------------------------------------------------------------
db.exec(`
CREATE TABLE IF NOT EXISTS servers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  name            TEXT NOT NULL,
  os              TEXT NOT NULL CHECK (os IN ('linux','windows')),
  control         TEXT NOT NULL DEFAULT 'auto' CHECK (control IN ('auto','ssh','winrm')),
  host            TEXT NOT NULL,
  port            INTEGER,
  username        TEXT NOT NULL,
  password        TEXT,
  ssh_key_path    TEXT,
  -- linux: sudo; windows: optional winrm transport / auth override
  sudo            INTEGER NOT NULL DEFAULT 1,
  tags            TEXT,
  enabled         INTEGER NOT NULL DEFAULT 1,
  last_status     TEXT,
  last_hashrate   TEXT,
  last_checked_at INTEGER,
  last_error      TEXT,
  created_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,
  level      TEXT NOT NULL,
  server_id  INTEGER,
  action     TEXT,
  message    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
CREATE INDEX IF NOT EXISTS idx_logs_server ON logs(server_id);
`);

// --- lightweight migrations (add columns introduced after the initial schema) -
function addColumn(name, def) {
  try { db.exec(`ALTER TABLE servers ADD COLUMN ${name} ${def}`); } catch (_) { /* already exists */ }
}
// auto-detected control channel (cached so we don't re-probe on every action)
addColumn('resolved_control', 'TEXT');
addColumn('resolved_auth', 'TEXT');
addColumn('resolved_port', 'INTEGER');

// --- default settings -------------------------------------------------------
const DEFAULTS = {
  // c3pool stratum (configurable). c3pool auto-routes by region on these.
  'pool.url': 'auto.c3pool.org:19999',
  'pool.url.backup': 'auto.c3pool.org:14444',
  'pool.tls': 'false',
  // xmrig build: 'xmrig-c3' (c3pool's GPL fork, github.com/C3Pool/xmrig-C3) | 'xmrig' (vanilla)
  'miner.build': 'xmrig-c3',
  // xmrig release version (must match the chosen build's tagging)
  'xmrig.version': '6.26.0-C4',
  // xmrig worker label suffix template, blank = use hostname
  'miner.worker': '',
  // install method: 'c3pool' (official c3pool one-liner, default) | 'custom' (our installer)
  'miner.method': 'c3pool',
  // CPU tuning: max cores to use (xmrig --max-cpu-uses) and priority (--cpu-priority 0-5); blank = default
  'miner.cpu_max': '',
  'miner.cpu_priority': '',
  // extra xmrig cmdline args
  'miner.extra_args': '',
  // xmrig local http api port (for hashrate). -1 disables.
  'miner.api_port': '18088',
  // your XMR wallet (payout). REQUIRED before mining.
  'wallet.address': '',
  // external api
  'api.enabled': 'true',
  'api.key': '',
  // web auth (default password; change in the panel after first login)
  'web.user': 'admin',
  'web.password': 'adminadmin',
  // bind
  'server.host': '0.0.0.0',
  'server.port': '7788',
};

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(key);
  if (row && row.value !== undefined && row.value !== null && row.value !== '') return row.value;
  if (key in DEFAULTS) return DEFAULTS[key];
  return fallback;
}

function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value'
  ).run(key, String(value));
}

function getAllSettings() {
  const out = { ...DEFAULTS };
  for (const row of db.prepare('SELECT key, value FROM settings').all()) {
    out[row.key] = row.value;
  }
  // NOTE: api.key and web.password are NOT auto-generated. The web password
  // defaults to 'adminadmin' (see DEFAULTS); the API key is empty until the
  // user sets it from the panel (an empty key disables the external API).
  return out;
}

// init seed on first load (creates tables; no secrets generated)
getAllSettings();

// --- logging ----------------------------------------------------------------
function logEvent({ level = 'info', server_id = null, action = '', message = '' }) {
  db.prepare(
    'INSERT INTO logs(ts, level, server_id, action, message) VALUES(?,?,?,?,?)'
  ).run(Date.now(), level, server_id, action, message);
  // also echo to console
  const tag = server_id ? `[#${server_id}]` : '';
  // eslint-disable-next-line no-console
  console.log(`[${level.toUpperCase()}] ${tag} ${action ? action + ': ' : ''}${message}`);
}

function recentLogs(limit = 200) {
  return db.prepare('SELECT * FROM logs ORDER BY ts DESC LIMIT ?').all(limit);
}

module.exports = {
  db,
  DB_PATH,
  getSetting,
  setSetting,
  getAllSettings,
  logEvent,
  recentLogs,
  DEFAULTS,
};
