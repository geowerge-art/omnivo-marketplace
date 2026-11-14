/* Reconstruiește subcategoriile (cu cuvinte-cheie) exact cum le lasă migrările 003 + 007 + 038, ca detect să fie testat fără bază de date. */
const { readSql, stripComments, valuesBlocks } = require('./sqlparse');

function leaves(files = ['003_subcategories.sql', '007_keywords.sql', '038_coverage.sql']) {
  const kw = {}, parent = {}, name = {}, order = [];
  for (const f of files) {
    const sql = stripComments(readSql(f));
    for (const rows of valuesBlocks(sql)) for (const r of rows) {
      if (r.length === 5 && typeof r[1] === 'string' && typeof r[2] === 'string' && typeof r[3] === 'number' && typeof r[4] === 'string') {
        const [p, slug, nm, , k] = r;
        if (!(slug in kw)) { order.push(slug); parent[slug] = p; name[slug] = nm; kw[slug] = k; }
      }
    }
    /* UPDATE-urile de cuvinte-cheie, în ordinea din fișier */
    const ops = [];
    for (const m of sql.matchAll(/UPDATE categories SET keywords = keywords \|\| '([^']*)' WHERE slug = '([a-z-]+)'/g)) ops.push([m.index, 'add', m[2], m[1]]);
    for (const m of sql.matchAll(/UPDATE categories SET keywords = trim\(regexp_replace\(' ' \|\| keywords \|\| ' ', '([^']*)', '', 'g'\)\) WHERE slug = '([a-z-]+)'/g)) ops.push([m.index, 'del', m[2], m[1]]);
    for (const m of sql.matchAll(/UPDATE categories SET name = '([^']*)' WHERE slug = '([a-z-]+)'/g)) ops.push([m.index, 'name', m[2], m[1]]);
    ops.sort((a, b) => a[0] - b[0]);
    for (const [, op, slug, val] of ops) {
      if (!(slug in kw)) continue;
      if (op === 'add') kw[slug] = (kw[slug] + ' ' + val).trim();
      else if (op === 'del') kw[slug] = (' ' + kw[slug] + ' ').replace(new RegExp(val, 'g'), '').trim();
      else name[slug] = val;
    }
  }
  return order.map((slug, i) => ({ id: i + 1, slug, name: name[slug], parent_name: parent[slug], keywords: kw[slug].split(/\s+/).filter(Boolean).join(' ') }));
}

module.exports = { leaves };
