const express = require('express');
const asyncHandler = require('express-async-handler');
const { db, logEvent } = require('../db');
const miner = require('../services/miner');

const router = express.Router();

function getServer(id) {
  return db.prepare('SELECT * FROM servers WHERE id=?').get(id);
}

function applyAction(action) {
  return asyncHandler(async (req, res) => {
    const r = getServer(req.params.id);
    if (!r) return res.status(404).json({ error: 'server not found' });
    try {
      const fn = miner[action];
      const result = await fn(r);
      const ok = /OK_/.test((result.stdout || '')) || result.exitCode === 0;
      res.json({ ok, exitCode: result.exitCode, stdout: (result.stdout || '').slice(-2000), stderr: (result.stderr || '').slice(-2000) });
    } catch (e) {
      logEvent({ level: 'error', server_id: r.id, action, message: e.message });
      res.status(500).json({ ok: false, error: e.message });
    }
  });
}

router.post('/:id/install', applyAction('install'));
router.post('/:id/uninstall', applyAction('uninstall'));
router.post('/:id/start', applyAction('start'));
router.post('/:id/stop', applyAction('stop'));
router.post('/:id/restart', applyAction('restart'));

// Bulk: POST /api/mining/bulk  { ids: [..] or null=all enabled, action: 'install'|... }
router.post('/bulk', asyncHandler(async (req, res) => {
  const action = req.body.action;
  if (!['install', 'uninstall', 'start', 'stop', 'restart', 'status'].includes(action)) {
    return res.status(400).json({ error: 'invalid action' });
  }
  let ids = req.body.ids;
  if (!Array.isArray(ids)) {
    ids = db.prepare('SELECT id FROM servers WHERE enabled=1').all().map((x) => x.id);
  }
  logEvent({ action: 'bulk.' + action, message: `批量操作 ${action}，共 ${ids.length} 台` });
  // run in parallel
  const results = await Promise.all(ids.map(async (id) => {
    const r = getServer(id);
    if (!r) return { id, ok: false, error: 'not found' };
    try {
      if (action === 'status') {
        const s = await miner.status(r);
        db.prepare(`UPDATE servers SET last_status=?, last_hashrate=?, last_checked_at=?, last_error=NULL WHERE id=?`)
          .run(s.active, s.hashrate || null, Date.now(), r.id);
        return { id, name: r.name, ...s };
      }
      const fn = miner[action];
      const result = await fn(r);
      const ok = /OK_/.test((result.stdout || '')) || result.exitCode === 0;
      return { id, name: r.name, ok, exitCode: result.exitCode, stdout: (result.stdout || '').slice(-500), stderr: (result.stderr || '').slice(-500) };
    } catch (e) {
      logEvent({ level: 'error', server_id: r.id, action, message: e.message });
      return { id, name: r.name, ok: false, error: e.message };
    }
  }));
  res.json({ results });
}));

module.exports = router;
