const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');
const { requireAuth } = require('./authmw');

const router = express.Router();
router.use(requireDb, requireAuth);
const MAX_FAVORITES = 200;

/* Id-urile anunțurilor salvate (cele mai recente primele). Anunțurile în sine se cer cu GET /api/listings?ids=... */
router.get('/ids', ah(async (req, res) => {
  const r = await db.query('SELECT listing_id FROM favorites WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2', [req.user.id, MAX_FAVORITES]);
  res.json({ ids: r.rows.map((x) => x.listing_id) });
}));

router.post('/:id(\\d+)', ah(async (req, res) => {
  const n = await db.query('SELECT COUNT(*)::int AS n FROM favorites WHERE user_id = $1', [req.user.id]);
  if (n.rows[0].n >= MAX_FAVORITES) return res.status(400).json({ error: 'PREA_MULTE_FAVORITE' });
  const r = await db.query(
    `INSERT INTO favorites (user_id, listing_id)
     SELECT $1, id FROM listings WHERE id = $2 AND status IN ('approved','sold')
     ON CONFLICT DO NOTHING`, [req.user.id, req.params.id]);
  const exists = r.rowCount || (await db.query('SELECT 1 FROM favorites WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.id])).rowCount;
  if (!exists) return res.status(404).json({ error: 'NEGASIT' });
  res.json({ ok: true });
}));

router.delete('/:id(\\d+)', ah(async (req, res) => {
  await db.query('DELETE FROM favorites WHERE user_id = $1 AND listing_id = $2', [req.user.id, req.params.id]);
  res.json({ ok: true });
}));

module.exports = { router };
