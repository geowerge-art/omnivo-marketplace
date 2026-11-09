const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');

const router = express.Router();
router.use(requireDb, requireAuth);
const MAX_SAVED = 30;

router.get('/', ah(async (req, res) => {
  const r = await db.query('SELECT id, q, category_slug, label, created_at FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [req.user.id, MAX_SAVED]);
  res.json({ searches: r.rows });
}));

router.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const q = String(b.q || '').trim().slice(0, 80), category = String(b.category || '').trim().slice(0, 60), label = String(b.label || '').trim().slice(0, 140);
  if (!q && !category) return res.status(400).json({ error: 'DATE_INVALIDE' });
  const dup = await db.query('SELECT id FROM saved_searches WHERE user_id = $1 AND q = $2 AND category_slug = $3', [req.user.id, q, category]);
  if (dup.rowCount) return res.json({ ok: true, id: dup.rows[0].id });
  const n = await db.query('SELECT COUNT(*)::int AS n FROM saved_searches WHERE user_id = $1', [req.user.id]);
  if (n.rows[0].n >= MAX_SAVED) return res.status(400).json({ error: 'PREA_MULTE_CAUTARI' });
  const r = await db.query('INSERT INTO saved_searches (user_id, q, category_slug, label) VALUES ($1,$2,$3,$4) RETURNING id', [req.user.id, q, category, label || q || category]);
  res.json({ ok: true, id: r.rows[0].id });
}));

router.delete('/:id(\\d+)', ah(async (req, res) => {
  await db.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

module.exports = { router };
