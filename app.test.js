/* Pornesc aplicația fără bază de date: verifică rutele de bază și protecțiile. Necesită `npm install`. */
const test = require('node:test');
const assert = require('node:assert');
const { createApp } = require('./app');

let server, base;
test.before(() => new Promise((ok) => { server = createApp().listen(0, () => { base = `http://127.0.0.1:${server.address().port}`; ok(); }); }));
test.after(() => server.close());

test('GET /api/health răspunde ok fără DB', async () => {
  const r = await fetch(`${base}/api/health`);
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(await r.json(), { ok: true, db: null });
});

test('rute /api inexistente dau 404 JSON, nu index.html', async () => {
  const r = await fetch(`${base}/api/nu-exista`);
  assert.strictEqual(r.status, 404);
  assert.strictEqual((await r.json()).error, 'NEGASIT');
});

test('/api/me fără sesiune întoarce user null', async () => {
  assert.deepStrictEqual(await (await fetch(`${base}/api/me`)).json(), { user: null });
});

test('conturile cer baza de date (503 fără DB)', async () => {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.strictEqual(r.status, 503);
});

test('Origin străin este refuzat la cereri POST', async () => {
  const r = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://rau.example' }, body: '{}' });
  assert.strictEqual(r.status, 403);
});

test('antete de securitate și pagina principală', async () => {
  const r = await fetch(`${base}/`);
  assert.strictEqual(r.status, 200);
  assert.ok(r.headers.get('content-security-policy').includes("script-src 'self'"));
  assert.ok(!r.headers.get('x-powered-by'));
});

test('mesageria și editarea cer baza de date (503 fără DB)', async () => {
  const hdr = { 'content-type': 'application/json' };
  assert.strictEqual((await fetch(`${base}/api/messages/unread`)).status, 503);
  assert.strictEqual((await fetch(`${base}/api/messages`, { method: 'POST', headers: hdr, body: '{}' })).status, 503);
  assert.strictEqual((await fetch(`${base}/api/listings/1`, { method: 'PATCH', headers: hdr, body: '{}' })).status, 503);
});
