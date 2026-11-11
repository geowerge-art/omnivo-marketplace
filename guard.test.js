const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

/* bază de date simulată: răspunde după forma interogării */
const S = { events: [], user: { created_at: new Date(Date.now() - 40 * 86400000), email_verified: true, phone: '0711111111' }, hist: { ok: 3, bad: 0 }, dup: false, med: { n: 0, med: null }, log: [] };
const fakeDb = {
  query: async (sql, p = []) => {
    S.log.push(sql.replace(/\s+/g, ' ').slice(0, 60));
    if (/INSERT INTO guard_events/.test(sql)) { S.events.push({ w: p[2] }); return { rows: [], rowCount: 1 }; }
    if (/AS d1/.test(sql)) { const t = S.events.reduce((n, e) => n + e.w, 0); return { rows: [{ d1: t, d7: t }], rowCount: 1 }; }
    if (/AS n FROM guard_events/.test(sql)) { return { rows: [{ n: S.events.reduce((n, e) => n + e.w, 0) }], rowCount: 1 }; }
    if (/FROM users WHERE id/.test(sql)) return { rows: [S.user], rowCount: 1 };
    if (/FILTER \(WHERE status IN \('approved','sold'\)\)/.test(sql)) return { rows: [S.hist], rowCount: 1 };
    if (/lower\(title\)/.test(sql)) return { rows: [], rowCount: S.dup ? 1 : 0 };
    if (/percentile_cont/.test(sql)) return { rows: [S.med], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }
};
require.cache[require.resolve('./db')] = { id: 'db', filename: path.resolve('./db.js'), loaded: true, exports: fakeDb };
const config = require('./config');
config.AUTO_SPOT_PCT = 0;
const guard = require('./guard');

const mkRes = () => ({ code: null, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
const reset = () => { S.events = []; S.log = []; S.dup = false; S.med = { n: 0, med: null }; S.hist = { ok: 3, bad: 0 }; S.user.created_at = new Date(Date.now() - 40 * 86400000); config.NEW_LISTING_STATUS = 'pending'; };

test('textul curat trece, echipa nu e filtrată', async () => {
  reset(); const res = mkRes();
  assert.equal(await guard.gate({ user: { id: 1, role: 'user' } }, res, ['Dacia Logan 2008', 'Stare bună, 120000 km']), false);
  assert.equal(await guard.gate({ user: { id: 2, role: 'admin' } }, res, ['sunați 0745123456']), false);
});
test('treptele: avertisment, avertisment, pauză 24 h', async () => {
  reset(); const u = { id: 1, role: 'user' };
  let r = mkRes(); assert.equal(await guard.gate({ user: u }, r, ['tel 0745 123 456']), true); assert.equal(r.code, 400); assert.equal(r.body.error, 'TELEFON_IN_TEXT');
  r = mkRes(); await guard.gate({ user: u }, r, ['scrie la a@b.ro']); assert.equal(r.code, 400); assert.equal(r.body.error, 'EMAIL_IN_TEXT');
  r = mkRes(); await guard.gate({ user: u }, r, ['www.site.ro']); assert.equal(r.code, 403); assert.equal(r.body.error, 'PUBLICARE_OPRITA');
  assert.ok(S.log.some((l) => /publish_blocked_until/.test(l)), 'a setat pauza');
});
test('cuvintele interzise cântăresc 3: pauză imediată, apoi blocarea contului', async () => {
  reset(); const u = { id: 1, role: 'user' };
  let r = mkRes(); await guard.gate({ user: u }, r, ['vând permis de conducere fals']); assert.equal(r.code, 403); assert.equal(r.body.error, 'PUBLICARE_OPRITA');
  for (let i = 0; i < 2; i++) await guard.gate({ user: u }, mkRes(), ['buletin fals']);          // 3 + 3 + 3 = 9
  r = mkRes(); await guard.gate({ user: u }, r, ['tel 0745123456']);                              // 10 => cont blocat
  assert.equal(r.body.error, 'CONT_BLOCAT_AUTO');
  assert.ok(S.log.some((l) => /SET status = 'blocked', block_reason/.test(l)) && S.log.some((l) => /DELETE FROM sessions/.test(l)));
});
test('publicare oprită: orice încercare e respinsă', async () => {
  reset(); const r = mkRes();
  assert.equal(await guard.gate({ user: { id: 1, role: 'user', publish_blocked_until: new Date(Date.now() + 3600000) } }, r, ['text curat']), true);
  assert.equal(r.body.error, 'PUBLICARE_OPRITA');
});
test('aprobare automată: utilizator cu istoric bun', async () => {
  reset(); const d = await guard.decide({ id: 1, role: 'user' }, { title: 'Bicicletă oraș', description: 'Bicicletă în stare foarte bună, folosită puțin, cu cadru de aluminiu', price: 800, currency: 'RON', category_id: 5 }, 'Bicicletă oraș');
  assert.equal(d.status, 'approved'); assert.equal(d.auto, true); assert.ok(d.score >= 60); assert.match(d.note, /Aprobat automat/);
});
test('primul anunț al unui cont nou merge la moderator', async () => {
  reset(); S.hist = { ok: 0, bad: 0 }; S.user.created_at = new Date(); S.user.email_verified = false; S.user.phone = null;
  const d = await guard.decide({ id: 1, role: 'user' }, { title: 'Telefon vechi', description: 'x', price: 100, currency: 'RON', category_id: 5 }, 'Telefon vechi');
  assert.equal(d.status, 'pending'); assert.match(d.note, /primul anunț/); assert.match(d.note, /cont nou/);
});
test('semnale de verificare: fraudă, titlu repetat, preț mult sub medie', async () => {
  reset(); const base = { title: 'Laptop', description: 'Laptop în stare bună, cu încărcător original și geantă', price: 1000, currency: 'RON', category_id: 5 };
  let d = await guard.decide({ id: 1, role: 'user' }, base, 'Laptop. Plata în avans prin Western Union'); assert.equal(d.status, 'pending'); assert.match(d.note, /fraudă/);
  S.dup = true; d = await guard.decide({ id: 1, role: 'user' }, base, 'Laptop'); assert.match(d.note, /titlu repetat/); S.dup = false;
  S.med = { n: 20, med: 5000 }; d = await guard.decide({ id: 1, role: 'user' }, { ...base, price: 500 }, 'Laptop'); assert.match(d.note, /sub media/);
});
test('moderare dezactivată: se publică direct, dar semnalele tot opresc anunțul', async () => {
  reset(); config.NEW_LISTING_STATUS = 'approved'; S.hist = { ok: 0, bad: 0 };
  let d = await guard.decide({ id: 1, role: 'user' }, { title: 'Masă lemn', description: 'x', price: 200, currency: 'RON', category_id: 5 }, 'Masă lemn');
  assert.equal(d.status, 'approved'); assert.equal(d.auto, false); assert.equal(d.note, null);
  d = await guard.decide({ id: 1, role: 'user' }, { title: 'Masă lemn', description: 'x', price: 200, currency: 'RON', category_id: 5 }, 'plătești avans');
  assert.equal(d.status, 'pending');
});
