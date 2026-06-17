const express = require('express');
const { recentLogs } = require('../db');
const router = express.Router();

router.get('/', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit || '200', 10), 1000);
  res.json({ logs: recentLogs(limit) });
});

module.exports = router;
