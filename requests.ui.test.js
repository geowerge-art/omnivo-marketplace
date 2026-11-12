/* Rulează requests-ui.js într-un DOM simulat și verifică comparația ofertelor și „Oferte primite”. */
const vm = require('vm'), fs = require('fs');
class El { constructor(t) { this.tagName = t.toUpperCase(); this.children = []; this.dataset = {}; this._cls = new Set(); this.style = {}; this._t = ''; this.attrs = {}; this.handlers = {};
    this.classList = { toggle: (c, on) => (on ? this._cls.add(c) : this._cls.delete(c)), add: (c) => this._cls.add(c), contains: (c) => this._cls.has(c) }; }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); } get className() { return [...this._cls].join(' '); }
  set textContent(v) { this._t = String(v); this.children = []; } get textContent() { return this._t + this.children.map((c) => (c.textContent !== undefined ? c.textContent : String(c))).join(''); }
  set innerHTML(v) { this.children = []; this._t = ''; } get firstChild() { return this.children[0]; }
  append(...n) { n.forEach((x) => this.children.push(typeof x === 'string' ? Object.assign(new El('#text'), { _t: x }) : x)); } replaceChildren(...n) { this.children = []; this._t = ''; this.append(...n); }
  setAttribute(k, v) { this.attrs[k] = v; } addEventListener(e, f) { this.handlers[e] = f; } remove() {} close() { this.open = false; } showModal() { this.open = true; } focus() {} blur() {}
  querySelectorAll(sel) { const out = []; const w = (n) => n.children.forEach((c) => { if (sel === 'button' ? c.tagName === 'BUTTON' : false) out.push(c); w(c); }); w(this); return out; }
  all(pred, out = []) { this.children.forEach((c) => { if (pred(c)) out.push(c); c.all(pred, out); }); return out; } }
El.prototype.all = El.prototype.all;
const els = {}; const doc = { createElement: (t) => new El(t), body: new El('body'), getElementById: (id) => els[id] || null, addEventListener() {}, activeElement: null };
const calls = [];
const ctx = { document: doc, window: {}, Date, Math, Number, String, Object, Array, Map, Set, Promise, JSON, console, setInterval: () => 0, clearInterval() {}, setTimeout, confirm: () => true, location: { hash: '' }, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, matchMedia: () => ({ matches: false }), history: { replaceState() {} },
  $: (id) => els[id] || (els[id] = new El('div')), api: async (u, m) => { calls.push([u, m || 'GET']); return ctx.__api(u, m); }, me: { id: 5, role: 'user' }, COUNTIES: ['Cluj', 'Bihor'], showMessage: (...a) => calls.push(['msg', ...a]), errText: (e) => String(e && e.message), ERR: {}, openAuth() {}, openLightbox() {} };
ctx.Option = class extends El { constructor(t, v) { super('option'); this._t = String(t); this.value = v; } };
ctx.window = ctx; vm.createContext(ctx);
let src = fs.readFileSync(__dirname + '/requests-ui.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__t = { viewAward, shipCard, addressForm, howBox, partsList, quoteForm, offersBlock, viewReceived, quoteCard, st, go, build, get body() { return body; } };\n})();');
vm.runInContext(src, ctx);
const T = ctx.__t; let ok = 0, bad = 0; const t = (n, p) => { p ? ok++ : bad++; console.log(`${p ? 'ok  ' : 'FAIL'} ${n}`); };
const text = (n) => n.textContent;
const Q = (o) => ({ id: 1, price: 100, currency: 'RON', state: 'buna', warranty_days: 0, eta_days: null, shipping: null, status: 'sent', created_at: new Date(Date.now() - 5 * 864e5).toISOString(), company: 'X', dealer_id: 9, dealer_county: 'Bihor', rating: null, rating_count: 0, verified: false, images: [], questions: [], ...o });
const R = { id: 7, county: 'Cluj', status: 'open' };
(async () => {
  T.build();
  const quotes = [Q({ id: 1, company: 'Ieftin', price: 100, shipping: 50, warranty_days: 0, dealer_county: 'Bihor' }),
    Q({ id: 2, company: 'Garantie', price: 120, shipping: 0, warranty_days: 90, eta_days: 1, rating: '4.8', rating_count: 12, dealer_county: 'Cluj', created_at: new Date().toISOString() }),
    Q({ id: 3, company: 'EuroPiese', price: 20, currency: 'EUR', shipping: 5, warranty_days: 30, eta_days: 0, dealer_county: 'Cluj' })];
  T.st.sort = 'total'; T.st.cmp = false;
  let nodes = T.offersBlock(R, quotes); const all = nodes.map(text).join('|');
  t('două sau mai multe oferte → bară de sortare + listă', nodes.length === 2 && /3 oferte/.test(text(nodes[0])));
  const bar = nodes[0], cards = nodes[1].children;
  t('ordinea implicită: după total (Ieftin 150, Garanție 120 → Garanție primul; EUR 25=125)', cards.map((c) => text(c).match(/Ieftin|Garantie|EuroPiese/)[0]).join() === 'Garantie,EuroPiese,Ieftin');
  const lab = (n) => text(cards[n]);
  t('„Cel mai mic total” doar pe oferta cu cel mai mic total (Garanție, 120 lei)', /Cel mai mic total/.test(lab(0)) && !/Cel mai mic total/.test(lab(1)) && !/Cel mai mic total/.test(lab(2)));
  t('„Cea mai lungă garanție” pe cea de 90 zile', /Cea mai lungă garanție/.test(lab(0)));
  t('„Livrare cea mai rapidă” pe cea „în stoc” (eta 0)', /Livrare cea mai rapidă/.test(lab(1)));
  t('„Cel mai bine cotat” pe cea cu ★ 4.8', /Cel mai bine cotat/.test(lab(0)));
  t('„În județul tău” pe ofertanții din Cluj, nu pe cel din Bihor', /În județul tău/.test(lab(0)) && /În județul tău/.test(lab(1)) && !/În județul tău/.test(lab(2)));
  t('oferta de azi are „Nouă”, cele vechi nu', /Nouă/.test(lab(0)) && !/Nouă/.test(lab(2)));
  t('total afișat cu transport: „Total 150 lei” + detaliu piesă/transport', /Total 150 lei/.test(lab(2)) && /piesa 100 lei \+ transport 50 lei/.test(lab(2)));
  t('transport gratuit afișat', /Total 120 lei/.test(lab(0)) && /transport gratuit/.test(lab(0)));
  ctx.openProfile = () => {}; nodes = T.offersBlock(R, quotes);
  t('cu openProfile disponibil, numele devine buton', nodes[1].children[0].all((c) => c.tagName === 'BUTTON' && c.className.includes('rfq-seller')).length === 1);
  // sortare după garanție
  const wBtn = nodes[0].children.find((b) => b.dataset && b.dataset.k === 'warranty'); wBtn.handlers.click ? 0 : 0;
  // butoanele au onclick (proprietate), nu addEventListener
  wBtn.onclick(); t('sortare după garanție: Garanție, apoi EuroPiese(30), apoi Ieftin(0)', nodes[1].children.map((c) => text(c).match(/Ieftin|Garantie|EuroPiese/)[0]).join() === 'Garantie,EuroPiese,Ieftin');
  const rBtn = nodes[0].children.find((b) => b.dataset && b.dataset.k === 'new'); rBtn.onclick(); t('sortare după „cele mai noi”: Garanție (azi) primul', /Garantie/.test(text(nodes[1].children[0])));
  const cBtn = nodes[0].children.find((b) => b.dataset && b.dataset.k === 'cmp'); cBtn.onclick();
  const tbl = nodes[1].children[0];
  t('tabel de comparare: un rând pe ofertă + antet', nodes[1].children.length === 1 && tbl.className.includes('rfq-cmp') && tbl.all((c) => c.tagName === 'TR').length === 4);
  const best = tbl.all((c) => c.tagName === 'TD' && c.className.includes('best'));
  t('în tabel e evidențiat un singur cel mai mic total (120 lei)', best.length === 1 && /120 lei/.test(text(best[0])));
  t('butonul din tabel activ pe „Compară”, nu pe sortare', nodes[0].children.filter((b) => b.className && b.className.includes(' on') || (b.classList && b.classList.contains('on'))).map((b) => b.dataset.k).join() === 'cmp');
  t('o singură ofertă → fără bară de sortare', T.offersBlock(R, [quotes[0]]).length === 1);
  t('fără oferte → nimic', T.offersBlock(R, []).length === 0);
  // „Oferte primite”
  const recv = [{ quote_id: 1, request_id: 7, company: 'A', price: 100, currency: 'RON', shipping: 10, status: 'sent', created_at: new Date().toISOString(), part: 'Far', brand: 'VW', model: 'Golf', year: 2015, request_status: 'open', expires_at: new Date(Date.now() + 36e5 * 5).toISOString(), rating: '4.5', rating_count: 2, state: 'buna', warranty_days: 30, thumb: '/t.webp' },
    { quote_id: 2, request_id: 7, company: 'B', price: 90, currency: 'RON', shipping: null, status: 'sent', created_at: new Date(Date.now() - 3 * 864e5).toISOString(), part: 'Far', brand: 'VW', model: 'Golf', year: 2015, request_status: 'open', expires_at: new Date(Date.now() + 36e5 * 5).toISOString(), rating: null, rating_count: 0, state: 'uzata', warranty_days: 0 },
    { quote_id: 3, request_id: 8, company: 'C', price: 50, currency: 'RON', shipping: 0, status: 'sent', created_at: new Date().toISOString(), part: 'Baie ulei', brand: 'BMW', model: '', year: null, request_status: 'open', expires_at: new Date(Date.now() + 36e5 * 5).toISOString(), rating: null, rating_count: 0, state: 'buna', warranty_days: 0 }];
  ctx.__api = async (u) => (u === '/api/requests/received' ? { offers: recv } : { offers: [] });
  await T.viewReceived(); const body = T.body, secs = body.children.filter((c) => c.className && c.className.includes('rfq-recv'));
  t('„Oferte primite”: o secțiune pe cerere (2 cereri)', secs.length === 2);
  t('secțiunea arată titlul cererii, numărul de oferte și câte sunt noi', /Far VW Golf 2015/.test(text(secs[0])) || /Far VW Golf 2015/.test(text(secs[1])));
  const s7 = secs.find((s) => /Golf/.test(text(s)));
  t('ofertele dintr-o cerere sunt în ordinea totalului (B 90+? vs A 110 → B primul)', text(s7).indexOf('B') < text(s7).indexOf('A'));
  t('total cu transport: A = 110 lei; B fără transport = 90 lei + transp.', /110 lei/.test(text(s7)) && /90 lei \+ transp\./.test(text(s7)));
  t('oferta de azi are „Nouă”', /Nouă/.test(text(s7)));
  ctx.__api = async () => ({ offers: [] }); await T.viewReceived(); t('fără oferte → mesaj + buton „Cere oferte pentru o piesă”', /Nu ai primit nicio ofertă/.test(text(T.body)) && /Cere oferte pentru o piesă/.test(text(T.body)));
  // piese multiple
  const RM = { id: 9, county: 'Cluj', status: 'open', items: [{ id: 1, name: 'Far stânga', details: '' }, { id: 2, name: 'Bară față', details: 'neagră' }, { id: 3, name: 'Capotă', details: '' }] };
  t('lista pieselor apare doar la cereri cu mai multe piese', !!T.partsList(RM) && T.partsList({ items: [{ id: 1, name: 'x' }] }) === null && /Bară față · neagră/.test(text(T.partsList(RM))));
  const part = T.quoteCard(RM, Q({ id: 21, company: 'Parțial', price: 150, lines: [{ item_id: 1, name: 'Far stânga', price: 100 }, { item_id: 3, name: 'Capotă', price: 50 }] }), []);
  t('oferta parțială: preț pe piesă și „Acoperă 2 din 3 piese”', /Far stânga/.test(text(part)) && /100 lei/.test(text(part)) && /Acoperă 2 din 3 piese/.test(text(part)) && /lipsesc: Bară față/.test(text(part)));
  const full = T.quoteCard(RM, Q({ id: 22, company: 'Complet', price: 300, lines: RM.items.map((i) => ({ item_id: i.id, name: i.name, price: 100 })) }), []);
  t('oferta completă: „Acoperă toate piesele”', /Acoperă toate piesele/.test(text(full)));
  const how = T.howBox(true); t('„Cum funcționează” are 4 pași', /Cum funcționează/.test(text(how)) && how.all((n) => n.tagName === 'LI').length === 4);
  const form = T.quoteForm(RM, () => {}); t('formularul de ofertă are câte un câmp de preț pe piesă', form.all((n) => n.tagName === 'INPUT' && n.attrs.placeholder === 'Preț' ).length === 3 || /Far stânga/.test(text(form)));
  // adresa de livrare
  ctx.__api = async (u, m, b) => (u.endsWith('/address') ? { address: { mode: 'livrare', kind: 'sediu', name: 'Ion Pop', phone: '0722123456', county: 'Cluj', city: 'Cluj-Napoca', street: 'Str. Memorandumului 5', note: '' }, defaults: { name: 'Ion', phone: '' } } : {});
  await T.viewAward(RM, Q({ id: 31, company: 'Nord Auto', price: 300, pickup: true }));
  const ab = text(T.body);
  t('alegerea ofertei cere adresa, completată din cont', /Unde|Cum primești piesele/.test(ab) && /Alegi oferta Nord Auto/.test(ab) && /Alege oferta și trimite adresa/.test(ab));
  const inputs = T.body.all((n) => n.tagName === 'INPUT');
  t('câmpurile sunt precompletate cu adresa salvată', inputs.some((i) => i.value === 'Str. Memorandumului 5') && inputs.some((i) => i.value === 'Cluj-Napoca'));
  const sc = T.shipCard({ mode: 'livrare', kind: 'sediu', name: 'Ion Pop', phone: '0722123456', county: 'Cluj', city: 'Cluj-Napoca', street: 'Str. X 1', note: 'poartă' }, 'Unde trimiți piesele');
  t('cardul de livrare arată nume, telefon, tip și adresă', /Ion Pop · 0722123456/.test(text(sc)) && /Livrare la sediul firmei: Str\. X 1, Cluj-Napoca, Cluj/.test(text(sc)) && /poartă/.test(text(sc)));
  t('ridicare personală se arată clar', /Ridică personal/.test(text(T.shipCard({ mode: 'ridicare', name: 'A', phone: '1' }))));
  console.log(`\n${ok} trecute, ${bad} eșuate`); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error('EROARE', e); process.exit(1); });
