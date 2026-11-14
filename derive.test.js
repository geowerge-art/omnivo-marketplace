const test = require('node:test');
const assert = require('node:assert');
const { deriveDiagonals } = require('./derive');

const KEYS = ['marca', 'diagonala', 'diagonala_cm'];
test('din inch se calculează cm', () => assert.deepStrictEqual(deriveDiagonals({ diagonala: 55 }, KEYS), { diagonala: 55, diagonala_cm: 140 }));
test('din cm se calculează inch', () => assert.deepStrictEqual(deriveDiagonals({ diagonala_cm: 108 }, KEYS), { diagonala_cm: 108, diagonala: 43 }));
test('dacă sunt amândouă, nu se schimbă nimic', () => assert.deepStrictEqual(deriveDiagonals({ diagonala: 55, diagonala_cm: 139 }, KEYS), { diagonala: 55, diagonala_cm: 139 }));
test('fără niciuna, rămâne gol', () => assert.deepStrictEqual(deriveDiagonals({ marca: 'LG' }, KEYS), { marca: 'LG' }));
test('la categoriile fără ambele câmpuri (ex. telefoane) nu face nimic', () => assert.deepStrictEqual(deriveDiagonals({ diagonala: 6.1 }, ['diagonala']), { diagonala: 6.1 }));
