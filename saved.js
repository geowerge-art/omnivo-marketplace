const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');

const router = express.Router();
router.use(requireDb, requireAuth);
const MAX_SAVED = 30;
/* Filtrele căutării (județ, preț, atribute...) se rețin ca șir de parametri; păstrăm doar cheile cunoscute. */
const PARAM_KEYS = /^(country|county|city|min|max|currency|condition|seller|sort|a_[a-z0-9_]{1,40})$/;
function cleanParams(raw) {
  const src = new URLSearchParams(String(raw || '').slice(0, 1200)), out = new URLSearchParams();
  for (const [k, v] of src) if (PARAM_KEYS.test(k) && String(v).trim()) out.set(k, String(v).trim().slice(0, 80));
  return out.toString().slice(0, 600);
}

router.get('/', ah(async (req, res) => {
  const r = await db.query('SELECT id, q, category_slug, label, params, created_at FROM saved_searches WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [req.user.id, MAX_SAVED]);
  res.json({ searches: r.rows });
}));

router.post('/', ah(async (req, res) => {
  const b = req.body || {};
  const q = String(b.q || '').trim().slice(0, 80), category = String(b.category || '').trim().slice(0, 60), label = String(b.label || '').trim().slice(0, 140);
  const params = cleanParams(b.params);
  if (!q && !category && !params) return res.status(400).json({ error: 'DATE_INVALIDE' });
  const dup = await db.query('SELECT id FROM saved_searches WHERE user_id = $1 AND q = $2 AND category_slug = $3 AND params = $4', [req.user.id, q, category, params]);
  if (dup.rowCount) return res.json({ ok: true, id: dup.rows[0].id });
  const n = await db.query('SELECT COUNT(*)::int AS n FROM saved_searches WHERE user_id = $1', [req.user.id]);
  if (n.rows[0].n >= MAX_SAVED) return res.status(400).json({ error: 'PREA_MULTE_CAUTARI' });
  const r = await db.query('INSERT INTO saved_searches (user_id, q, category_slug, label, params) VALUES ($1,$2,$3,$4,$5) RETURNING id', [req.user.id, q, category, label || q || category, params]);
  res.json({ ok: true, id: r.rows[0].id });
}));

router.delete('/:id(\\d+)', ah(async (req, res) => {
  await db.query('DELETE FROM saved_searches WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
  res.json({ ok: true });
}));

module.exports = { router };
