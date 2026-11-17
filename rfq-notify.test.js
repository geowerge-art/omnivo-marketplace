/* Notificări cereri/oferte: mereu în aplicație, email doar pentru evenimentele importante și doar când are sens. Fără rețea / bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const orig = Module._load; const inApp = [], mails = []; let dbScript = null, ready = true, userRow = { email: 'ion@x.ro', nickname: 'Ion <b>' }, sql = [], failMail = false;
Module._load = function (req, ...a) {
  if (req === './db') return { query: async (s, p) => { sql.push({ s, p }); if (dbScript) return dbScript(s, p); return { rows: userRow ? [userRow] : [] }; } };
  if (req === './config') return { APP_URL: 'https://omnivo.test' };
  if (req === './notify') return { notify: async (...x) => { inApp.push(x); } };
  if (req === './mail') return { get MAIL_READY() { return ready; }, sendMail: async (...x) => { if (failMail) throw new Error('Resend 500'); mails.push(x); return true; } };
  return orig.call(this, req, ...a);
};
const N = require('./rfq-notify');
Module._load = orig;
const tick = () => new Promise((r) => setTimeout(r, 10));
const DAY = new Date('2026-11-17T10:00:00Z');   // 12:00 în România: în afara intervalului de liniște
const reset = () => { N.clock.now = () => DAY; dbScript = null; delete process.env.RFQ_QUIET_START; delete process.env.RFQ_QUIET_END; inApp.length = 0; mails.length = 0; sql = []; ready = true; userRow = { email: 'ion@x.ro', nickname: 'Ion <b>' }; failMail = false; };

test('evenimente importante: notificare în aplicație + email cu link către pagina potrivită', async () => {
  const cases = { rfq_new: '/cereri', rfq_quote: '/cererile-mele', rfq_won: '/ofertele-mele', rfq_q: '/intrebari-oferte', rfq_a: '/cererile-mele', rfq_ship: '/comenzi-piese', rfq_done: '/comenzi-piese', rfq_mod: '/cererile-mele', rfq_expired: '/cererile-mele', review: '/comenzi-piese' };
  for (const [kind, path] of Object.entries(cases)) {
    reset(); await N.notify(7, kind, null, 'Titlu', 'Corp'); await tick();
    assert.strictEqual(inApp.length, 1, kind + ': în aplicație'); assert.deepStrictEqual(inApp[0].slice(0, 5), [7, kind, null, 'Titlu', 'Corp']);
    assert.strictEqual(mails.length, 1, kind + ': email'); assert.strictEqual(mails[0][0], 'ion@x.ro'); assert.strictEqual(mails[0][1], 'Titlu');
    assert.ok(mails[0][2].includes(`href="https://omnivo.test${path}"`), kind + ' link html'); assert.ok(mails[0][3].includes('https://omnivo.test' + path), kind + ' link text');
  }
});

test('evenimentele minore (modificare, retragere, refuz) rămân doar în aplicație', async () => {
  for (const kind of ['rfq_edit', 'rfq_lost', 'rfq_remind']) { reset(); await N.notify(7, kind, null, 'T', 'C'); await tick(); assert.strictEqual(inApp.length, 1); assert.strictEqual(mails.length, 0, kind); assert.strictEqual(sql.length, 0, 'nici măcar nu caută adresa'); }
});

test('opțiunile apelantului: email:false oprește emailul, email:true îl forțează, path-ul se poate schimba', async () => {
  reset(); await N.notify(7, 'rfq_new', null, 'T', 'C', { email: false }); await tick(); assert.strictEqual(inApp.length, 1); assert.strictEqual(mails.length, 0);
  reset(); await N.notify(7, 'rfq_lost', null, 'Anulată', '', { email: true, path: '/comenzi-piese' }); await tick(); assert.strictEqual(mails.length, 1); assert.match(mails[0][2], /omnivo\.test\/comenzi-piese/);
  reset(); await N.notify(7, 'rfq_mod', null, 'T', 'C', { path: '/ofertele-mele' }); await tick(); assert.match(mails[0][3], /omnivo\.test\/ofertele-mele/);
});

test('fără email când mailul nu e configurat, adresa nu e verificată / contul inactiv / utilizatorul l-a oprit', async () => {
  reset(); ready = false; await N.notify(7, 'rfq_quote', null, 'T', 'C'); await tick(); assert.strictEqual(inApp.length, 1, 'în aplicație tot pleacă'); assert.strictEqual(mails.length, 0); assert.strictEqual(sql.length, 0, 'fără mail configurat nu se interoghează baza');
  reset(); userRow = null; await N.notify(7, 'rfq_quote', null, 'T', 'C'); await tick(); assert.strictEqual(mails.length, 0);
  reset(); await N.notify(7, 'rfq_quote', null, 'T', 'C'); await tick();
  const q = sql[0].s; assert.match(q, /status = 'active'/); assert.match(q, /email_verified = TRUE/); assert.match(q, /rfq_email = TRUE/); assert.deepStrictEqual(sql[0].p, [7]);
});

test('conținutul emailului e escapat (fără HTML injectat din titluri/mesaje) și are explicația de dezabonare', async () => {
  reset(); await N.notify(7, 'rfq_q', null, '<script>alert(1)</script>', 'a "b" & <i>c</i>'); await tick();
  const html = mails[0][2]; assert.ok(!html.includes('<script>') && !html.includes('<i>c</i>')); assert.ok(html.includes('&lt;script&gt;') && html.includes('a &quot;b&quot; &amp; &lt;i&gt;c&lt;/i&gt;'));
  assert.ok(html.includes('Salut, Ion &lt;b&gt;,')); assert.match(html, /Nu mai vrei emailuri despre cereri și oferte/); assert.match(mails[0][3], /Nu mai vrei emailuri/);
});

test('eroarea de la furnizorul de mail nu strică fluxul (notificarea din aplicație rămâne)', async () => {
  reset(); failMail = true; const err = console.error; const logged = []; console.error = (...x) => logged.push(x.join(' '));
  try { await N.notify(7, 'rfq_won', null, 'T', 'C'); await tick(); } finally { console.error = err; }
  assert.strictEqual(inApp.length, 1); assert.ok(logged.some((l) => /rfq mail/.test(l) && /Resend 500/.test(l)));
});

const at = (iso) => () => new Date(iso);

test('interval de liniște 22:00-08:00 ora României, corect și vara/iarna', () => {
  const q = (iso) => N.quiet(new Date(iso));
  // iarna (EET, UTC+2)
  assert.strictEqual(q('2026-11-17T19:59:00Z'), false, '21:59'); assert.strictEqual(q('2026-11-17T20:00:00Z'), true, '22:00'); assert.strictEqual(q('2026-11-17T22:00:00Z'), true, '00:00');
  assert.strictEqual(q('2026-11-18T05:59:00Z'), true, '07:59'); assert.strictEqual(q('2026-11-18T06:00:00Z'), false, '08:00');
  // vara (EEST, UTC+3)
  assert.strictEqual(q('2026-07-01T18:59:00Z'), false, '21:59 vara'); assert.strictEqual(q('2026-07-01T19:00:00Z'), true, '22:00 vara'); assert.strictEqual(q('2026-07-02T04:59:00Z'), true, '07:59 vara'); assert.strictEqual(q('2026-07-02T05:00:00Z'), false, '08:00 vara');
  // configurabil: același număr = dezactivat; interval în aceeași zi
  process.env.RFQ_QUIET_START = '8'; process.env.RFQ_QUIET_END = '8'; assert.strictEqual(q('2026-11-17T22:00:00Z'), false);
  process.env.RFQ_QUIET_START = '13'; process.env.RFQ_QUIET_END = '15'; assert.strictEqual(q('2026-11-17T11:30:00Z'), true, '13:30'); assert.strictEqual(q('2026-11-17T10:00:00Z'), false, '12:00');
  delete process.env.RFQ_QUIET_START; delete process.env.RFQ_QUIET_END;
});

test('noaptea emailul nu pleacă: se reține în coadă (doar pentru cei care l-ar primi), notificarea din aplicație pleacă imediat', async () => {
  reset(); N.clock.now = at('2026-11-17T21:30:00Z');   // 23:30
  await N.notify(7, 'rfq_quote', null, 'Ofertă nouă: Far', '150 lei'); await tick();
  assert.strictEqual(inApp.length, 1, 'în aplicație imediat'); assert.strictEqual(mails.length, 0, 'fără email noaptea');
  const ins = sql.find((x) => /INSERT INTO rfq_mail_queue/.test(x.s)); assert.ok(ins, 'reținut în coadă');
  assert.deepStrictEqual(ins.p, [7, 'rfq_quote', 'Ofertă nouă: Far', '150 lei', '/cererile-mele']);
  assert.match(ins.s, /WHERE EXISTS \(SELECT 1 FROM users WHERE id = \$1 AND status = 'active' AND email_verified = TRUE AND rfq_email = TRUE\)/, 'cei care au oprit emailul nu intră în coadă');
  reset(); N.clock.now = at('2026-11-18T06:00:00Z'); await N.notify(7, 'rfq_quote', null, 'T', 'C'); await tick();   // 08:00
  assert.strictEqual(mails.length, 1, 'la 08:00 pleacă imediat'); assert.ok(!sql.some((x) => /rfq_mail_queue/.test(x.s)));
});

test('dimineața: flushQueue trimite un email per om, rezumat dacă sunt mai multe, respectă opt-out-ul', async () => {
  reset(); N.clock.now = at('2026-11-17T21:30:00Z'); assert.strictEqual(await N.flushQueue(), 0, 'în timpul nopții nu trimite nimic'); assert.strictEqual(sql.length, 0);
  reset();
  const rows = [{ id: 1, user_id: 7, title: 'Ofertă nouă: Far', body: '150 lei', path: '/cererile-mele' }, { id: 2, user_id: 8, title: 'Comandă expediată: Bară', body: '', path: '/comenzi-piese' },
    { id: 3, user_id: 7, title: 'Întrebare la oferta ta <b>', body: 'Are garanție?', path: '/intrebari-oferte' }, { id: 4, user_id: 7, title: 'Ofertă nouă: Capotă', body: '90 lei', path: '/cererile-mele' }, { id: 5, user_id: 9, title: 'Ofertă nouă: X', body: '', path: '/cererile-mele' }];
  dbScript = (s) => (/UPDATE rfq_mail_queue SET sent_at = NOW\(\)/.test(s) ? { rows } : /FROM users WHERE id = ANY/.test(s) ? { rows: [{ id: 7, email: 'ion@x.ro', nickname: 'Ion' }, { id: 8, email: 'ana@x.ro', nickname: 'Ana' }] } : { rows: [] });   // 9 a oprit emailul
  const n = await N.flushQueue(); assert.strictEqual(n, 2);
  const by = Object.fromEntries(mails.map((m) => [m[0], m]));
  assert.strictEqual(by['ana@x.ro'][1], 'Comandă expediată: Bară', 'un singur element = email obișnuit');
  assert.strictEqual(by['ion@x.ro'][1], 'Ai 3 notificări noi în Omnivo', 'mai multe = un rezumat');
  const html = by['ion@x.ro'][2]; assert.ok(html.includes('Ofertă nouă: Far') && html.includes('Ofertă nouă: Capotă') && html.includes('Are garanție?')); assert.ok(html.includes('href="https://omnivo.test/intrebari-oferte"'));
  assert.ok(html.includes('Întrebare la oferta ta &lt;b&gt;') && !html.includes('<b>'), 'escapat'); assert.ok(!mails.some((m) => m[0] === 'x@y.ro' || /X$/.test(m[1])), 'cel cu opt-out nu primește nimic');
  assert.ok(sql.some((x) => /DELETE FROM rfq_mail_queue WHERE sent_at < NOW\(\) - INTERVAL '3 days'/.test(x.s)), 'curăță coada veche');
});

test('flushQueue: la eroare de trimitere rândurile revin în coadă; fără mail configurat nu atinge coada', async () => {
  reset(); failMail = true; const err = console.error; console.error = () => {};
  dbScript = (s) => (/UPDATE rfq_mail_queue SET sent_at = NOW\(\)/.test(s) ? { rows: [{ id: 4, user_id: 7, title: 'T', body: '', path: '/cereri' }, { id: 6, user_id: 7, title: 'U', body: '', path: '/cereri' }] } : /FROM users WHERE id = ANY/.test(s) ? { rows: [{ id: 7, email: 'ion@x.ro', nickname: 'Ion' }] } : { rows: [] });
  try { assert.strictEqual(await N.flushQueue(), 0); } finally { console.error = err; }
  const back = sql.find((x) => /SET sent_at = NULL WHERE id = ANY/.test(x.s)); assert.deepStrictEqual(back.p, [[4, 6]], 'revin în coadă pentru încercarea următoare');
  reset(); ready = false; assert.strictEqual(await N.flushQueue(), 0); assert.strictEqual(sql.length, 0);
});
