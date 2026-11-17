/* Ștergerea contului: anunțuri + poze, plus datele din cereri/oferte/comenzi (poze din Storage, notă privată, comenzi fără participanți). Fără bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const path = require('path');

const log = []; let failOn = null, removed = null;
const client = { query: async (s, p) => {
  log.push({ s: s.replace(/\s+/g, ' ').trim(), p });
  if (failOn && failOn.test(s)) throw new Error('boom');
  if (/FROM listing_images/.test(s)) return { rows: [{ url: 'https://st/l1.jpg', thumb_url: 'https://st/l1-t.jpg' }] };
  if (/FROM rq_images/.test(s)) return { rows: [{ url: 'https://st/r1.jpg', thumb_url: 'https://st/r1-t.jpg' }, { url: 'https://st/o1.jpg', thumb_url: null }] };
  if (/DELETE FROM listings/.test(s)) return { rowCount: 3, rows: [] };
  return { rows: [], rowCount: 0 };
}, release() { log.push({ s: 'RELEASE' }); } };
const inject = (name, exports) => { const id = require.resolve(path.join(__dirname, name)); require.cache[id] = { id, filename: id, loaded: true, exports }; };
inject('db.js', { pool: { connect: async () => client } });
inject('images.js', { removeStored: async (...u) => { removed = u; } });
const { eraseUser } = require('./erase');
const reset = () => { log.length = 0; failOn = null; removed = null; };
const sqls = () => log.map((x) => x.s);

test('șterge poze din Storage: anunțuri + cereri + oferte (ale lui și cele primite la cererile lui)', async () => {
  reset(); const r = await eraseUser(42);
  assert.deepStrictEqual(removed, ['https://st/l1.jpg', 'https://st/l1-t.jpg', 'https://st/r1.jpg', 'https://st/r1-t.jpg', 'https://st/o1.jpg']);
  assert.deepStrictEqual(r, { listings: 3, images: 5 });
  const q = log.find((x) => /FROM rq_images/.test(x.s)); assert.deepStrictEqual(q.p, [42]);
  assert.match(q.s, /owner_id = \$1/); assert.match(q.s, /request_id IN \(SELECT id FROM rq_requests WHERE user_id = \$1\)/); assert.match(q.s, /offer_id IN \(SELECT o\.id FROM rq_offers o JOIN rq_requests q ON q\.id = o\.request_id WHERE q\.user_id = \$1\)/);
});

test('ordinea în tranzacție: pozele se citesc ÎNAINTE de ștergerea utilizatorului; nota privată se șterge; comenzile fără participanți dispar', async () => {
  reset(); await eraseUser(42); const s = sqls();
  const i = (re) => s.findIndex((x) => re.test(x));
  assert.strictEqual(s[0], 'BEGIN'); assert.ok(s.includes('COMMIT')); assert.strictEqual(s.at(-1), 'RELEASE');
  assert.ok(i(/FROM rq_images/) < i(/DELETE FROM users/), 'cascada ar șterge rândurile cu URL-uri înainte să le citim');
  assert.ok(i(/UPDATE rq_orders SET seller_note = NULL WHERE seller_id = \$1/) < i(/DELETE FROM users/));
  assert.ok(i(/DELETE FROM rq_orders WHERE buyer_id IS NULL AND seller_id IS NULL/) > i(/DELETE FROM users/), 'curățenia vine după ce participanții devin NULL');
  assert.ok(i(/DELETE FROM users/) < i(/COMMIT/));
});

test('la eroare: ROLLBACK, conexiunea se eliberează, nu se șterge nimic din Storage', async () => {
  reset(); failOn = /DELETE FROM users/;
  await assert.rejects(() => eraseUser(42), /boom/);
  const s = sqls(); assert.ok(s.includes('ROLLBACK') && !s.includes('COMMIT')); assert.strictEqual(s.at(-1), 'RELEASE'); assert.strictEqual(removed, null, 'fișierele rămân dacă ștergerea a eșuat');
});

test('eroarea din Storage nu strică ștergerea contului', async () => {
  reset(); inject('images.js', { removeStored: async () => { throw new Error('storage jos'); } });
  const err = console.error, logged = []; console.error = (...x) => logged.push(x.join(' '));
  try { const r = await eraseUser(7); assert.strictEqual(r.listings, 3); } finally { console.error = err; inject('images.js', { removeStored: async (...u) => { removed = u; } }); }
  assert.ok(logged.some((l) => /erase: poze rămase în Storage/.test(l) && /storage jos/.test(l)));
});
