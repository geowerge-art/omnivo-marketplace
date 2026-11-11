const test = require('node:test');
const assert = require('node:assert');
const { target, EVERY_MS } = require('./keepalive');

test('pingul se pornește doar în producție, cu adresă https publică', () => {
  assert.strictEqual(target({}, { IS_PROD: true, APP_URL: 'https://omnivo.onrender.com' }), 'https://omnivo.onrender.com/api/health');
  assert.strictEqual(target({}, { IS_PROD: false, APP_URL: 'https://omnivo.onrender.com' }), null);
  assert.strictEqual(target({}, { IS_PROD: true, APP_URL: '' }), null);
  assert.strictEqual(target({}, { IS_PROD: true, APP_URL: 'http://localhost:10000' }), null);
});
test('KEEPALIVE=off îl oprește', () => {
  assert.strictEqual(target({ KEEPALIVE: 'off' }, { IS_PROD: true, APP_URL: 'https://omnivo.onrender.com' }), null);
});
test('intervalul e de 10 minute', () => assert.strictEqual(EVERY_MS, 600000));
