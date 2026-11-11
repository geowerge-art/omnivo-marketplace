const test = require('node:test');
const assert = require('node:assert');
const { scan, makeScanner, chatRisk } = require('./guardscan');
const types = (t) => scan(t).block.map((x) => x.type);

test('blochează telefoane în forme diferite', () => {
  for (const t of ['Sunați la 0745123456', 'tel 0745 123 456', 'Tel: 0745.123.456', '0745-123-456', '07 45 12 34 56', '+40 745 123 456', '0040745123456', '(0745) 123-456',
    'zero sapte patru cinci unu doi trei patru cinci sase', 'zero șapte patru cinci 123 456', '021 123 4567', '0244 123 456', '0745/123/456']) {
    assert.ok(types(t).includes('phone'), 'ar trebui blocat: ' + t);
  }
});
test('nu blochează numere obișnuite', () => {
  for (const t of ['Preț 1.250.000 lei negociabil', 'An fabricație 2019, 120000 km', 'Serie șasiu WVWZZZ1KZAW123456', 'Dacia Logan 2008, 1.5 dci, 68 CP', 'Cod produs 5901234123457',
    'Perioada 07.2019 - 03.2021', 'Dimensiuni 120x200 cm, greutate 35 kg', 'iPhone 14 Pro Max 256GB', 'Telefon Samsung A54 128GB, stare 9/10', 'Locuiesc la 12 km de oraș, program 08-18',
    'Apartament 3 camere, 65 mp, etaj 2/4, 74500 euro', 'Pompe 1200 W, 220 V, 50 Hz, an 2020']) {
    assert.deepEqual(types(t), [], 'nu ar trebui blocat: ' + t);
  }
});
test('prinde e-mailuri, linkuri și trimiteri pe aplicații', () => {
  assert.ok(types('scrie la ion.popescu@gmail.com').includes('email'));
  assert.ok(types('ion (at) gmail (dot) com').includes('email'));
  assert.ok(types('vezi pe www.olx.ro/anunt').includes('link'));
  assert.ok(types('https://wa.me/40745123456').includes('link'));
  assert.ok(types('Scrie-mi pe WhatsApp').includes('messenger'));
  assert.ok(types('număr pe telegram').includes('messenger'));
  assert.deepEqual(types('Husă compatibilă cu iPhone, nu e Samsung'), []);
  assert.deepEqual(types('Vând cameră foto, pozele sunt postate pe instagram-ul meu'), [], 'mențiunea simplă nu blochează');
});
test('cuvinte interzise și fraudă', () => {
  assert.ok(types('Vând permis de conducere fals').includes('banned'));
  assert.ok(types('cocaină pură').includes('banned'));
  assert.deepEqual(types('Mă oprește MDM-ul? nu, vând telefon'), []);
  assert.equal(scan('plata în avans prin Western Union').review[0].type, 'fraud');
  assert.equal(scan('Rate fără avans, preluare leasing').review.length, 1, 'cuvântul „avans” trimite la verificare, nu blochează');
  assert.equal(scan('Avansul meu pentru rate e mic').review.length, 0, 'forma „avansul” nu e semnal de fraudă');
  const s = makeScanner(['zmeura rosie']);
  assert.ok(s('Vând zmeură roșie').block.some((x) => x.type === 'banned'), 'lista suplimentară din BLOCKED_WORDS');
});
test('avertisment în chat', () => {
  assert.ok(chatRisk('trimite-mi codul din SMS primit'));
  assert.ok(chatRisk('plătești avans și îți trimit'));
  assert.ok(chatRisk('intră pe https://plata-sigura.xyz'));
  assert.ok(!chatRisk('Mai este disponibil? Pot ajunge mâine la 17:00'));
});
