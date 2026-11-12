/* Validările și potrivirea din „Cere oferte” (funcții pure, fără bază de date). */
const test = require('node:test');
const assert = require('node:assert');
const { parseRequest, parseQuote, parseDealer, dealerMatches, brandKey } = require('./requests');

const okReq = { part: 'Far stânga', brand: 'VW', model: 'Golf 7', year: 2015, county: 'Cluj' };

test('cerere validă: marca se normalizează, termen 48 h, tip „oricare”', () => {
  const r = parseRequest(okReq);
  assert.ok(r.v);
  assert.strictEqual(r.v.brand_key, 'volkswagen');
  assert.strictEqual(r.v.hours, 48);
  assert.strictEqual(r.v.kind, 'oricare');
  assert.strictEqual(parseRequest({ ...okReq, kind: 'noi' }).v.kind, 'noi');
  assert.strictEqual(parseRequest({ ...okReq, kind: 'altceva' }).v.kind, 'oricare');
});

test('cerere invalidă: piesă scurtă, an imposibil, VIN greșit, fără județ', () => {
  assert.strictEqual(parseRequest({ ...okReq, part: 'ab' }).error, 'PIESA_INVALIDA');
  assert.strictEqual(parseRequest({ ...okReq, year: 1800 }).error, 'AN_INVALID');
  assert.strictEqual(parseRequest({ ...okReq, vin: 'ABC' }).error, 'VIN_INVALID');
  assert.strictEqual(parseRequest({ ...okReq, vin: 'WVWZZZ1KZAW123456' }).v.vin, 'WVWZZZ1KZAW123456');
  assert.strictEqual(parseRequest({ ...okReq, county: '' }).error, 'JUDET_LIPSA');
  assert.strictEqual(parseRequest({ ...okReq, hours: 5 }).v.hours, 48);
  assert.strictEqual(parseRequest({ ...okReq, hours: 72 }).v.hours, 72);
});

test('cererea e publică: telefon, email, link refuzate; codurile OEM trec', () => {
  for (const details of ['sună-mă la 0722 123 456', 'ion@mail.ro', 'vezi www.exemplu.ro']) {
    assert.strictEqual(parseRequest({ ...okReq, details }).error, 'FARA_CONTACT_IN_CERERE', details);
  }
  assert.ok(parseRequest({ ...okReq, details: 'Cod OEM 1K0 941 005 A, culoare neagră' }).v);
  for (const details of ['Dacia cod 8200123456', 'Renault 7700 100 123', 'Bosch 0 986 494 123', 'Mercedes A 204 540 12 17']) assert.ok(parseRequest({ ...okReq, details }).v, details);   // coduri OEM lungi, nu telefoane
  for (const details of ['sună 07 22 12 34 56', 'tel +40 722 123 456', 'tel 0040722123456']) assert.strictEqual(parseRequest({ ...okReq, details }).error, 'FARA_CONTACT_IN_CERERE', details);
});

test('ofertă: preț obligatoriu, transport gol = de stabilit, 0 = gratuit, piesă nouă acceptată', () => {
  assert.strictEqual(parseQuote({ price: '' }).error, 'PRET_INVALID');
  assert.strictEqual(parseQuote({ price: -5 }).error, 'PRET_INVALID');
  assert.strictEqual(parseQuote({ price: 250 }).v.shipping, null);
  assert.strictEqual(parseQuote({ price: 250, shipping: 0 }).v.shipping, 0);
  assert.strictEqual(parseQuote({ price: 250, warranty_days: 1000 }).error, 'GARANTIE_INVALIDA');
  assert.strictEqual(parseQuote({ price: 250 }).v.eta_days, null);
  assert.strictEqual(parseQuote({ price: 250, eta_days: 0 }).v.eta_days, 0);
  assert.strictEqual(parseQuote({ price: 250, eta_days: '3' }).v.eta_days, 3);
  assert.strictEqual(parseQuote({ price: 250, eta_days: 61 }).error, 'TERMEN_INVALID');
  assert.strictEqual(parseQuote({ price: 250, eta_days: 1.5 }).error, 'TERMEN_INVALID');
  assert.strictEqual(parseQuote({ price: 250, state: 'nimic' }).v.state, 'buna');
  assert.strictEqual(parseQuote({ price: 250, state: 'noua' }).v.state, 'noua');
});

test('ofertă: contactul (telefon, email, link) e refuzat în notă', () => {
  for (const note of ['sună la 0722 123 456', 'scrie la ion@firma.ro', 'vezi www.firma.ro', 'https://firma.ro']) {
    assert.strictEqual(parseQuote({ price: 100, note }).error, 'FARA_CONTACT_IN_OFERTA', note);
  }
  assert.ok(parseQuote({ price: 100, note: 'Cod OEM 5K0941005, 120000 km' }).v);
});

test('dezmembrător: CUI, mărci normalizate și fără dubluri', () => {
  assert.strictEqual(parseDealer({ company: 'A', county: 'Cluj' }).error, 'FIRMA_INVALIDA');
  assert.strictEqual(parseDealer({ company: 'Auto SRL', cui: 'abc', county: 'Cluj' }).error, 'CUI_INVALID');
  const d = parseDealer({ company: 'Auto SRL', cui: 'ro 123456', county: 'Cluj', brands: 'VW, Volkswagen, Dacia, Mercedes-Benz', counties: ['Cluj', 'Cluj', 'Bihor'] });
  assert.strictEqual(d.v.cui, 'RO123456');
  assert.deepStrictEqual(d.v.brands, ['volkswagen', 'dacia', 'mercedes']);
  assert.deepStrictEqual(d.v.counties, ['Cluj', 'Bihor']);
});

test('potrivire: liste goale = toate; altfel marca și județul trebuie acoperite', () => {
  const r = { brand_key: 'dacia', county: 'Cluj' };
  assert.ok(dealerMatches({ brands: [], counties: [] }, r));
  assert.ok(dealerMatches({ brands: ['dacia'], counties: ['Cluj', 'Bihor'] }, r));
  assert.ok(!dealerMatches({ brands: ['audi'], counties: [] }, r));
  assert.ok(!dealerMatches({ brands: [], counties: ['Iași'] }, r));
});

test('brandKey: diacritice, majuscule, alias-uri', () => {
  assert.strictEqual(brandKey(' ŠKODA '), 'skoda');
  assert.strictEqual(brandKey('Land-Rover'), 'land rover');
});

test('cerere: cod OEM, combustibil, cutie, caroserie; valori necunoscute se ignoră', () => {
  const v = parseRequest({ ...okReq, oem: ' 1k0  941 005 a ', fuel: 'motorina', gearbox: 'automata', body_type: 'break' }).v;
  assert.strictEqual(v.oem, '1K0 941 005 A');
  assert.strictEqual(v.fuel, 'motorina'); assert.strictEqual(v.gearbox, 'automata'); assert.strictEqual(v.body_type, 'break');
  const w = parseRequest({ ...okReq, fuel: 'apa', gearbox: 'x', body_type: 'nava' }).v;
  assert.strictEqual(w.fuel, ''); assert.strictEqual(w.gearbox, ''); assert.strictEqual(w.body_type, '');
  assert.strictEqual(parseRequest({ ...okReq, oem: 'ab@x.ro' }).error, 'OEM_INVALID');
  assert.strictEqual(parseRequest({ ...okReq }).v.oem, '');
});

test('ofertă: factură și mod de plată', () => {
  const a = parseQuote({ price: 100 }).v;
  assert.strictEqual(a.invoice, false); assert.strictEqual(a.payment, 'oricare');
  const b = parseQuote({ price: 100, invoice: true, payment: 'ramburs' }).v;
  assert.strictEqual(b.invoice, true); assert.strictEqual(b.payment, 'ramburs');
  assert.strictEqual(parseQuote({ price: 100, payment: 'bitcoin' }).v.payment, 'oricare');
});

test('cerere cu mai multe piese: nume unite, maximum 8, fără contact', () => {
  const r = parseRequest({ ...okReq, part: '', parts: [{ name: 'Far stânga' }, { name: 'Bară față', details: 'neagră' }] });
  assert.strictEqual(r.v.part, 'Far stânga, Bară față');
  assert.strictEqual(r.v.items.length, 2);
  assert.strictEqual(parseRequest(okReq).v.items.length, 1);   // vechiul câmp „part” = o singură piesă
  assert.strictEqual(parseRequest({ ...okReq, parts: Array.from({ length: 9 }, () => ({ name: 'Piesă' })) }).error, 'PREA_MULTE_PIESE');
  assert.strictEqual(parseRequest({ ...okReq, parts: [{ name: 'ab' }] }).error, 'PIESA_INVALIDA');
  assert.strictEqual(parseRequest({ ...okReq, parts: [{ name: 'Far', details: 'sună 0722 123 456' }] }).error, 'FARA_CONTACT_IN_CERERE');
});

test('ofertă pe piese: total = suma, parțială permisă, piesă străină refuzată', () => {
  const ids = [11, 12, 13];
  const q = parseQuote({ lines: [{ item_id: 11, price: 100.5 }, { item_id: 13, price: '50', state: 'noua' }] }, ids);
  assert.strictEqual(q.v.price, 150.5);
  assert.strictEqual(q.v.lines.length, 2);
  assert.strictEqual(parseQuote({ lines: [{ item_id: 99, price: 5 }] }, ids).error, 'PIESA_NECUNOSCUTA');
  assert.strictEqual(parseQuote({ lines: [{ item_id: 11, price: 5 }, { item_id: 11, price: 6 }] }, ids).error, 'PIESA_NECUNOSCUTA');
  assert.strictEqual(parseQuote({ lines: [{ item_id: 11, price: 0 }] }, ids).error, 'PRET_INVALID');
  assert.strictEqual(parseQuote({ lines: [] }, ids).error, 'FARA_PIESE_IN_OFERTA');
  assert.strictEqual(parseQuote({ price: 100 }, ids).error, 'FARA_PIESE_IN_OFERTA');   // 3 piese cer preț pe piesă
  assert.strictEqual(parseQuote({ price: 100 }, [11]).v.price, 100);                      // o piesă: prețul întreg
});
