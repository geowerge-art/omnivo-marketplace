/* Notificări cereri/oferte: mereu în aplicație, email doar pentru evenimentele importante și doar când are sens. Fără rețea / bază de date. */
const test = require('node:test');
const assert = require('node:assert');
const Module = require('module');

const orig = Module._load; const inApp = [], mails = []; let ready = true, userRow = { email: 'ion@x.ro', nickname: 'Ion <b>' }, sql = [], failMail = false;
Module._load = function (req, ...a) {
  if (req === './db') return { query: async (s, p) => { sql.push({ s, p }); return { rows: userRow ? [userRow] : [] }; } };
  if (req === './config') return { APP_URL: 'https://omnivo.test' };
  if (req === './notify') return { notify: async (...x) => { inApp.push(x); } };
  if (req === './mail') return { get MAIL_READY() { return ready; }, sendMail: async (...x) => { if (failMail) throw new Error('Resend 500'); mails.push(x); return true; } };
  return orig.call(this, req, ...a);
};
const N = require('./rfq-notify');
Module._load = orig;
const tick = () => new Promise((r) => setTimeout(r, 10));
const reset = () => { inApp.length = 0; mails.length = 0; sql = []; ready = true; userRow = { email: 'ion@x.ro', nickname: 'Ion <b>' }; failMail = false; };

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
