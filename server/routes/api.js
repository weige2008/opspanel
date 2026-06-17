// External API for one-click mining control. Auth: X-API-Key header.
// Mounted under /api/v1
const express = require('express');
const asyncHandler = require('express-async-handler');
const { db, getSetting, logEvent } = require('../db');
const miner = require('../services/miner');

const router = express.Router();

// auth middleware
router.use((req, res, next) => {
  if (getSetting('api.enabled') === 'false') {
    return res.status(403).json({ error: 'external api disabled' });
  }
  const stored = getSetting('api.key');
  if (!stored) {
    return res.status(401).json({ error: 'api key 未设置：请在面板「设置 → Web 与 API」中生成一个 API Key 后再调用外部接口。' });
  }
  const key = req.header('X-API-Key') || req.query.key;
  if (!key || key !== stored) {
    return res.status(401).json({ error: 'invalid api key' });
  }
  next();
});

function pickServer(req) {
  const id = parseInt(req.params.id, 10);
  return db.prepare('SELECT * FROM servers WHERE id=?').get(id);
}

// GET /api/v1/servers
router.get('/servers', (req, res) => {
  const rows = db.prepare('SELECT id,name,os,control,host,port,enabled,last_status,last_hashrate,last_checked_at,last_error FROM servers').all();
  res.json({ servers: rows });
});

// GET /api/v1/status  -> overall: wallet + per-server miner status (quick)
router.get('/status', asyncHandler(async (req, res) => {
  const rows = db.prepare('SELECT * FROM servers WHERE enabled=1').all();
  const results = [];
  for (const r of rows) {
    try {
      const s = await miner.status(r);
      results.push({ id: r.id, name: r.name, os: r.os, host: r.host, ...s });
    } catch (e) {
      results.push({ id: r.id, name: r.name, host: r.host, ok: false, active: 'error', error: e.message });
    }
  }
  res.json({
    wallet: getSetting('wallet.address'),
    pool: getSetting('pool.url'),
    servers: results,
  });
}));

// POST /api/v1/mine/start   {"ids":[..]} or omit for all enabled
//   - ensures miner is installed+running ("一键开挖")
router.post('/mine/start', asyncHandler(async (req, res) => {
  let ids = Array.isArray(req.body && req.body.ids) ? req.body.ids
    : db.prepare('SELECT id FROM servers WHERE enabled=1').all().map((x) => x.id);
  logEvent({ action: 'api.start', message: `API 一键开挖 ${ids.length} 台` });

  const out = [];
  for (const id of ids) {
    const r = pickServer({ params: { id } });
    if (!r) { out.push({ id, ok: false, error: 'not found' }); continue; }
    try {
      // if not enabled/installed, install; else start
      let st;
      try { st = await miner.status(r); } catch (_) { st = { active: 'unknown' }; }
      if (st.active !== 'yes') {
        try {
          await miner.install(r);
          out.push({ id, name: r.name, ok: true, action: 'installed' });
        } catch (e1) {
          // fall back to plain start in case already installed
          try { await miner.start(r); out.push({ id, name: r.name, ok: true, action: 'started' }); }
          catch (e2) { out.push({ id, name: r.name, ok: false, error: e2.message }); }
        }
      } else {
        out.push({ id, name: r.name, ok: true, action: 'already-running' });
      }
    } catch (e) {
      out.push({ id, name: r.name, ok: false, error: e.message });
    }
  }
  res.json({ ok: out.every((x) => x.ok), results: out });
}));

// POST /api/v1/mine/stop    {"ids":[..]}
router.post('/mine/stop', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids
    : db.prepare('SELECT id FROM servers WHERE enabled=1').all().map((x) => x.id);
  const out = [];
  for (const id of ids) {
    const r = pickServer({ params: { id } });
    if (!r) { out.push({ id, ok: false, error: 'not found' }); continue; }
    try { await miner.stop(r); out.push({ id, name: r.name, ok: true }); }
    catch (e) { out.push({ id, name: r.name, ok: false, error: e.message }); }
  }
  res.json({ ok: out.every((x) => x.ok), results: out });
}));

// POST /api/v1/mine/restart
router.post('/mine/restart', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids
    : db.prepare('SELECT id FROM servers WHERE enabled=1').all().map((x) => x.id);
  const out = [];
  for (const id of ids) {
    const r = pickServer({ params: { id } });
    if (!r) { out.push({ id, ok: false, error: 'not found' }); continue; }
    try { await miner.restart(r); out.push({ id, name: r.name, ok: true }); }
    catch (e) { out.push({ id, name: r.name, ok: false, error: e.message }); }
  }
  res.json({ ok: out.every((x) => x.ok), results: out });
}));

// POST /api/v1/mine/install
router.post('/mine/install', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids
    : db.prepare('SELECT id FROM servers WHERE enabled=1').all().map((x) => x.id);
  const out = [];
  for (const id of ids) {
    const r = pickServer({ params: { id } });
    if (!r) { out.push({ id, ok: false, error: 'not found' }); continue; }
    try { await miner.install(r); out.push({ id, name: r.name, ok: true }); }
    catch (e) { out.push({ id, name: r.name, ok: false, error: e.message }); }
  }
  res.json({ ok: out.every((x) => x.ok), results: out });
}));

// POST /api/v1/mine/uninstall
router.post('/mine/uninstall', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids
    : db.prepare('SELECT id FROM servers WHERE enabled=1').all().map((x) => x.id);
  const out = [];
  for (const id of ids) {
    const r = pickServer({ params: { id } });
    if (!r) { out.push({ id, ok: false, error: 'not found' }); continue; }
    try { await miner.uninstall(r); out.push({ id, name: r.name, ok: true }); }
    catch (e) { out.push({ id, name: r.name, ok: false, error: e.message }); }
  }
  res.json({ ok: out.every((x) => x.ok), results: out });
}));

module.exports = router;
