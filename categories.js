const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');

const router = express.Router();
router.use(requireDb);

const { detect } = require('./detect');
let leafCache = null;

/* Sugestie de categorie după titlu (vezi detect.js): întoarce variantele, dacă sistemul e sigur și, uneori, o întrebare. */
router.get('/suggest', ah(async (req, res) => {
  const title = String(req.query.title || '').slice(0, 200);
  if (title.trim().length < 3) return res.json({ suggestions: [], ask: null, confident: false });
  if (!leafCache || Date.now() - leafCache.at > 5 * 60 * 1000) {
    const r = await db.query(
      `SELECT c.id, c.slug, c.name, p.name AS parent_name, c.keywords
         FROM categories c JOIN categories p ON p.id = c.parent_id WHERE c.keywords <> ''`);
    leafCache = { at: Date.now(), rows: r.rows };
  }
  res.json(detect(title, leafCache.rows));
}));

/* Arborele de categorii, cu atributele fiecăreia. Se schimbă rar, deci îl ținem 5 minute în memorie. */
let cache = null;
router.get('/', ah(async (req, res) => {
  if (cache && Date.now() - cache.at < 5 * 60 * 1000) return res.json(cache.body);
  const [cats, attrs] = await Promise.all([
    db.query('SELECT id, parent_id, slug, name, icon FROM categories ORDER BY position, id'),
    db.query('SELECT category_id, key, label, type, options, required, filterable FROM category_attributes ORDER BY position, id')
  ]);
  const byCat = {};
  for (const a of attrs.rows) (byCat[a.category_id] ||= []).push({ key: a.key, label: a.label, type: a.type, options: a.options, required: a.required, filterable: a.filterable });
  const nodes = cats.rows.map((c) => ({ ...c, attributes: byCat[c.id] || [], children: [] }));
  const map = new Map(nodes.map((n) => [n.id, n]));
  const roots = [];
  for (const n of nodes) (n.parent_id && map.get(n.parent_id) ? map.get(n.parent_id).children : roots).push(n);
  const body = { categories: roots };
  cache = { at: Date.now(), body };
  res.json(body);
}));

module.exports = { router };
