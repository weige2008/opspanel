const express = require('express');
const asyncHandler = require('express-async-handler');
const { db, logEvent } = require('../db');
const { testConnection } = require('../services/control');
const miner = require('../services/miner');

const router = express.Router();

function row(r) {
  if (!r) return r;
  // never return the password to the client; keep a flag instead
  const { password, ssh_key_path, ...safe } = r;
  return { ...safe, has_password: !!password, has_key: !!ssh_key_path };
}

// GET /api/servers
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM servers ORDER BY id ASC').all();
  res.json({ servers: rows.map(row) });
});

// GET /api/servers/:id
router.get('/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  res.json({ server: row(r) });
});

function validateBody(body, partial = false) {
  const errs = [];
  const need = (k) => partial ? true : (body[k] != null && body[k] !== '');
  if (!need('name') && !partial) errs.push('name required');
  if (body.os && !['linux', 'windows'].includes(body.os)) errs.push('os must be linux|windows');
  if (body.control && !['auto', 'ssh', 'winrm'].includes(body.control)) errs.push('control must be auto|ssh|winrm');
  if (!partial && !body.host) errs.push('host required');
  if (!partial && !body.username) errs.push('username required');
  return errs;
}

// POST /api/servers
router.post('/', asyncHandler(async (req, res) => {
  const errs = validateBody(req.body);
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });
  const b = req.body;
  const port = b.port || (b.os === 'windows' && b.control !== 'ssh' ? 5985 : 22);
  const info = db.prepare(`INSERT INTO servers
    (name, os, control, host, port, username, password, ssh_key_path, sudo, tags, enabled, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    b.name, b.os, b.control || 'auto', b.host, port, b.username, b.password || null,
    b.ssh_key_path || null, b.sudo == null ? 1 : b.sudo ? 1 : 0, b.tags || '', b.enabled == null ? 1 : b.enabled ? 1 : 0,
    Date.now()
  );
  logEvent({ action: 'server.add', message: `添加服务器 ${b.name} (${b.host})` });
  const r = db.prepare('SELECT * FROM servers WHERE id=?').get(info.lastInsertRowid);
  res.json({ server: row(r) });
}));

// PUT /api/servers/:id
router.put('/:id', asyncHandler(async (req, res) => {
  const r = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  const errs = validateBody(req.body, true);
  if (errs.length) return res.status(400).json({ error: errs.join('; ') });
  const b = req.body;
  const port = b.port != null ? b.port : r.port;
  const password = b.password !== undefined ? (b.password === '' ? r.password : b.password) : r.password;
  const sshKey = b.ssh_key_path !== undefined ? (b.ssh_key_path === '' ? r.ssh_key_path : b.ssh_key_path) : r.ssh_key_path;
  db.prepare(`UPDATE servers SET name=?, os=?, control=?, host=?, port=?, username=?, password=?,
    ssh_key_path=?, sudo=?, tags=?, enabled=? WHERE id=?`).run(
    b.name ?? r.name, b.os ?? r.os, b.control ?? r.control, b.host ?? r.host, port,
    b.username ?? r.username, password, sshKey,
    b.sudo != null ? (b.sudo ? 1 : 0) : r.sudo,
    b.tags ?? r.tags, b.enabled != null ? (b.enabled ? 1 : 0) : r.enabled, r.id
  );
  logEvent({ action: 'server.update', server_id: r.id, message: `更新服务器 ${r.name}` });
  const updated = db.prepare('SELECT * FROM servers WHERE id=?').get(r.id);
  res.json({ server: row(updated) });
}));

// DELETE /api/servers/:id
router.delete('/:id', asyncHandler(async (req, res) => {
  const r = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  db.prepare('DELETE FROM servers WHERE id=?').run(r.id);
  logEvent({ action: 'server.delete', server_id: r.id, message: `删除服务器 ${r.name}` });
  res.json({ ok: true });
}));

// POST /api/servers/:id/test  -> test connection
router.post('/:id/test', asyncHandler(async (req, res) => {
  const r = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  const result = await testConnection(r);
  res.json(result);
}));

// POST /api/servers/:id/status -> query miner status (no state change)
router.post('/:id/status', asyncHandler(async (req, res) => {
  const r = db.prepare('SELECT * FROM servers WHERE id=?').get(req.params.id);
  if (!r) return res.status(404).json({ error: 'not found' });
  try {
    const s = await miner.status(r);
    db.prepare(`UPDATE servers SET last_status=?, last_hashrate=?, last_checked_at=?, last_error=NULL WHERE id=?`)
      .run(s.active, s.hashrate || null, Date.now(), r.id);
    res.json(s);
  } catch (e) {
    db.prepare(`UPDATE servers SET last_error=?, last_checked_at=? WHERE id=?`)
      .run(e.message.slice(0, 300), Date.now(), r.id);
    res.json({ ok: false, active: 'error', error: e.message });
  }
}));

module.exports = router;
