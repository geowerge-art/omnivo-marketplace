const express = require('express');
const db = require('./db');
const { ah, requireDb } = require('./common');

const router = express.Router();
router.use(requireDb);

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
let leafCache = null;

/* Sugestie de categorie după titlu: potrivire pe cuvinte-cheie (cuvânt întreg = 3 puncte, început de cuvânt = 2). */
router.get('/suggest', ah(async (req, res) => {
  const words = fold(req.query.title).split(/[^a-z0-9]+/).filter((w) => w.length >= 3).slice(0, 12);
  if (!words.length) return res.json({ suggestions: [] });
  if (!leafCache || Date.now() - leafCache.at > 5 * 60 * 1000) {
    const r = await db.query(
      `SELECT c.id, c.slug, c.name, p.name AS parent_name, c.keywords
         FROM categories c JOIN categories p ON p.id = c.parent_id WHERE c.keywords <> ''`);
    leafCache = { at: Date.now(), rows: r.rows.map((x) => ({ ...x, kw: x.keywords.split(' ') })) };
  }
  const scored = leafCache.rows.map((c) => {
    let score = 0;
    for (const w of words) for (const k of c.kw) {
      if (w === k) score += 3;
      else if (k.length >= 4 && w.length >= 4 && (w.startsWith(k) || k.startsWith(w))) score += 2;
    }
    return { id: c.id, slug: c.slug, name: c.name, parent: c.parent_name, score };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
  res.json({ suggestions: scored });
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
