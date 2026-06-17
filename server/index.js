'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const { getAllSettings, getSetting } = require('./db');

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// --- serve frontend (Vue + Vite build -> web/dist) --------------------------
const CLIENT_DIR = path.join(__dirname, '..', 'web', 'dist');
const INDEX_FILE = path.join(CLIENT_DIR, 'index.html');
if (!fs.existsSync(INDEX_FILE)) {
  // eslint-disable-next-line no-console
  console.warn(`[opspanel] 前端尚未构建：${INDEX_FILE} 不存在。\n  请在 web/ 目录运行: npm install && npm run build\n  API 仍可正常使用。`);
}
app.use(express.static(CLIENT_DIR, { index: false }));

// --- basic web auth (the management API uses user/password from settings) --
function decodeBasic(header) {
  if (!header || !header.toLowerCase().startsWith('basic ')) return null;
  try {
    const [u, p] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
    return { user: u, pass: p };
  } catch (_) { return null; }
}
function decodeBearer(header) {
  if (!header || !header.toLowerCase().startsWith('bearer ')) return null;
  try {
    const [u, p] = Buffer.from(header.slice(7), 'base64').toString('utf8').split(':');
    return { user: u, pass: p };
  } catch (_) { return null; }
}
function validWebCreds(user, pass) {
  return user === getSetting('web.user') && pass === getSetting('web.password');
}

function webAuth(req, res, next) {
  const basic = decodeBasic(req.header('Authorization'));
  const bearer = decodeBearer(req.header('Authorization'));
  const c = basic || bearer;
  if (c && validWebCreds(c.user, c.pass)) return next();
  res.status(401).json({ error: 'unauthorized' });
}

// health (no auth) - useful for uptime checks
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// auth check used by the SPA login page
app.post('/api/auth/check', (req, res) => {
  const c = decodeBasic(req.header('Authorization')) || decodeBearer(req.header('Authorization'));
  if (c && validWebCreds(c.user, c.pass)) {
    return res.json({ ok: true, user: c.user });
  }
  res.status(401).json({ ok: false, error: 'invalid credentials' });
});

// --- mount management routes (web-authed) ----------------------------------
app.use('/api/servers', webAuth, require('./routes/servers'));
app.use('/api/mining', webAuth, require('./routes/mining'));
app.use('/api/settings', webAuth, require('./routes/settings'));
app.use('/api/logs', webAuth, require('./routes/logs'));
app.use('/api/bootstrap', webAuth, require('./routes/bootstrap'));

// --- mount external api (api-key authed, internal) -------------------------
app.use('/api/v1', require('./routes/api'));

// SPA fallback (history-mode routing for the Vue app)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  if (!fs.existsSync(INDEX_FILE)) return res.status(404).type('text').send('Frontend not built. Run `npm run build` in web/.');
  res.sendFile(INDEX_FILE, (err) => {
    if (err) next(err);
  });
});

// --- error handler ---------------------------------------------------------
app.use((err, req, res, next) => {
  // eslint-disable-next-line no-console
  console.error('[error]', err);
  res.status(500).json({ error: err.message || 'internal error' });
});

function start() {
  const settings = getAllSettings();
  const host = settings['server.host'] || '0.0.0.0';
  const port = parseInt(settings['server.port'] || '7788', 10);
  const hasApiKey = !!settings['api.key'];
  const pwHint = settings['web.password'] === 'adminadmin' ? 'adminadmin (默认，请尽快修改)' : '****';
  app.listen(port, host, () => {
    // eslint-disable-next-line no-console
    console.log(`\n  OpsPanel — server management console`);
    console.log(`  -----------------------------`);
    console.log(`  Web:  http://localhost:${port}`);
    console.log(`  user: ${settings['web.user']}  pass: ${pwHint}`);
    console.log(`  API:  POST /api/v1/mine/start  (X-API-Key: ${hasApiKey ? '已设置' : '未设置 — 请在面板中生成'})`);
    console.log();
  });
}

if (require.main === module) start();

module.exports = app;
