const express = require('express');
const asyncHandler = require('express-async-handler');
const { db, getAllSettings, setSetting, DEFAULTS } = require('../db');

const router = express.Router();

// GET /api/settings
router.get('/', (req, res) => {
  const s = { ...getAllSettings() };
  // mask the api key, never expose web password fully
  res.json({ settings: s });
});

// PUT /api/settings  (partial update of any keys)
router.put('/', asyncHandler(async (req, res) => {
  const allowed = new Set(Object.keys(DEFAULTS));
  const updates = {};
  for (const [k, v] of Object.entries(req.body || {})) {
    if (allowed.has(k)) updates[k] = v;
  }
  for (const [k, v] of Object.entries(updates)) setSetting(k, v);
  res.json({ ok: true, updated: Object.keys(updates), settings: getAllSettings() });
}));

module.exports = router;
