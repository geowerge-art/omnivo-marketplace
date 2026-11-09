const test = require('node:test');
const assert = require('node:assert');
const S = require('./security');

test('weakPassword respinge parole slabe', () => {
  assert.strictEqual(S.weakPassword('scurta'), 'TOO_SHORT');
  assert.strictEqual(S.weakPassword('parola123'), 'COMMON');
  assert.strictEqual(S.weakPassword('12345678'), 'COMMON');
  assert.strictEqual(S.weakPassword('98765432'), 'ONLY_DIGITS');
  assert.strictEqual(S.weakPassword('aaaaaaaaaa'), 'REPEATED');
  assert.strictEqual(S.weakPassword('x'.repeat(80)), 'TOO_LONG');
  assert.strictEqual(S.weakPassword('maria.popescu99!', { email: 'maria.popescu@exemplu.ro' }), 'CONTAINS_EMAIL');
  assert.strictEqual(S.weakPassword('Cal-Verde-Aleargă-7'), null);
});

test('nickname: fără @ și fără spații', () => {
  assert.ok(S.NICK_RE.test('dezkamle1'));
  assert.ok(!S.NICK_RE.test('ab'));
  assert.ok(!S.NICK_RE.test('a@b.ro'));
  assert.ok(!S.NICK_RE.test('doua cuvinte'));
});

test('hashToken e determinist, iar tokenurile noi sunt unice', () => {
  assert.strictEqual(S.hashToken('abc'), S.hashToken('abc'));
  assert.notStrictEqual(S.newToken(), S.newToken());
  assert.strictEqual(S.hashToken('abc').length, 64);
});

test('createThrottle blochează după limită', () => {
  const allow = S.createThrottle(3, 60000);
  assert.ok(allow('k') && allow('k') && allow('k'));
  assert.ok(!allow('k'));
  assert.ok(allow('alt-key'));
});
