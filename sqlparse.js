/* Cititor mic pentru migrările de categorii. Folosit doar în teste (nu rulează în aplicație). */
const fs = require('fs');
const path = require('path');

const readSql = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, '');

/* Citește o listă `('a', 1, NULL, TRUE), (...)` care începe imediat după un cuvânt VALUES. Întoarce rândurile ca tablouri. */
function parseTuples(s, i) {
  const rows = [];
  for (;;) {
    while (i < s.length && /[\s,]/.test(s[i])) i++;
    if (s[i] !== '(') break;
    i++;
    const row = [];
    for (;;) {
      while (/\s/.test(s[i])) i++;
      let v;
      if (s[i] === "'") {
        let t = '';
        for (i++; i < s.length; i++) {
          if (s[i] === "'" && s[i + 1] === "'") { t += "'"; i++; } else if (s[i] === "'") { i++; break; } else t += s[i];
        }
        v = t;
      } else {
        const m = /^[^,)\s]+/.exec(s.slice(i)); const raw = m[0]; i += raw.length;
        v = raw === 'NULL' ? null : raw === 'TRUE' ? true : raw === 'FALSE' ? false : Number(raw);
        if (typeof v === 'number' && Number.isNaN(v)) throw new Error('valoare necunoscută: ' + raw);
      }
      row.push(v);
      while (/\s/.test(s[i])) i++;
      if (s[i] === ',') { i++; continue; }
      if (s[i] === ')') { i++; break; }
      throw new Error('tuplu rupt lângă: ' + s.slice(i, i + 40));
    }
    rows.push(row);
  }
  return rows;
}

function valuesBlocks(sql) {
  const s = stripComments(sql), out = [];
  const re = /VALUES\s*(?=\()/g; let m;
  while ((m = re.exec(s))) out.push(parseTuples(s, m.index + m[0].length));
  return out;
}

module.exports = { readSql, stripComments, parseTuples, valuesBlocks };
