/* Rulează requests-ui.js într-un DOM simulat și verifică paginile: lista publică, detaliu, formular, Cererile mele, oferte, comenzi, întrebări. */
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
const ctx = { URLSearchParams, document: doc, window: { addEventListener() {} }, addEventListener() {}, Date, Math, Number, String, Object, Array, Map, Set, Promise, JSON, console, setInterval: () => 0, clearInterval() {}, setTimeout, confirm: () => true, location: { hash: '', pathname: '/' }, localStorage: { getItem: () => null, setItem() {} }, navigator: {}, matchMedia: () => ({ matches: false }), history: { replaceState() {}, pushState() {} },
  $: (id) => els[id] || (els[id] = new El('div')), api: async (u, m) => { calls.push([u, m || 'GET']); return ctx.__api(u, m); }, me: { id: 5, role: 'user' }, COUNTIES: ['Cluj', 'Bihor'], showMessage: (...a) => calls.push(['msg', ...a]), errText: (e) => String(e && e.message), ERR: {}, openAuth() {}, openLightbox() {} };
ctx.Option = class extends El { constructor(t, v) { super('option'); this._t = String(t); this.value = v; } };
ctx.window = Object.assign(ctx, { }); vm.createContext(ctx);
let src = fs.readFileSync(__dirname + '/requests-ui.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__t = { viewBoard, viewDetail, viewNew, viewMine, viewReceived, viewOffers, viewOrders, viewQuestions, st, go, build, get body() { return body; }, get head() { return head; } };\n})();');
vm.runInContext(src, ctx);
const T = ctx.__t; let ok = 0, bad = 0; const t = (n, p) => { p ? ok++ : bad++; console.log(`${p ? 'ok  ' : 'FAIL'} ${n}`); };
const text = (n) => n.textContent; const tick = () => new Promise((r) => setTimeout(r, 5));
const iso = (d = 0) => new Date(Date.now() + d * 864e5).toISOString();
const REQ = (o) => ({ id: 1, title: 'Far stânga', description: '', make: 'Audi', model: 'A4', year: '2012', variant: '', engine: '', kind: 'ambele', county: 'Timiș', city: 'Timișoara', extra_parts: [], status: 'open', expires_at: iso(5), created_at: iso(-1), mine: false, thumb: null, offers_count: 0, my_offer_id: null, my_mark: null, ...o });
(async () => {
  T.build();
  // lista publică
  ctx.__api = async (u) => ({ requests: [REQ({ id: 1 }), REQ({ id: 2, title: 'Alternator', my_offer_id: 9, my_price: 450, my_currency: 'RON' }), REQ({ id: 3, title: 'Bară', mine: true, offers_count: 2, extra_parts: [{ title: 'Grilă' }] })], counts: { new: 1, all: 3, offered: 1, later: 0, ignored: 0 } });
  await T.go('board'); await tick(); let s = text(T.body);
  t('Ofertează piesele: filtrele de stare cu număr', /Nu am ofertat încă \(1\)/.test(s) && /Am ofertat \(1\)/.test(s) && /Ofertez mai târziu/.test(s) && /Ignorate/.test(s));
  t('carduri: titlu, mașină, „Ai ofertat 450 lei”, „Nicio ofertă”, „Cererea ta · 2 oferte”, +1 piesă', /Far stânga/.test(s) && /Audi A4 2012/.test(s) && /Ai ofertat 450 lei/.test(s) && /Nicio ofertă/.test(s) && /Cererea ta · 2 oferte/.test(s) && /\+1 piesă/.test(s));
  t('butoane „Ofertez mai târziu” și „Ignoră” doar pe cererile fără ofertă ale altora', (s.match(/Ignoră/g) || []).length === 1);
  t('lista cere seen=new', calls.some((c) => /^\/api\/requests\?seen=new/.test(c[0])));
  // detaliu public, fără ofertă proprie: formular de ofertă
  ctx.__api = async (u) => ({ request: REQ({ id: 4, images: [], buyer_name: 'Ion' }), my_offer: null, my_mark: null });
  await T.go('detail', 4); await tick(); s = text(T.body);
  t('detaliu: formular „Trimite o ofertă” cu prețul tău', /Trimite o ofertă/.test(s) && /Prețul tău/.test(s) && /Cerută de Ion/.test(s));
  // detaliu cu ofertă proprie în așteptare
  ctx.__api = async () => ({ request: REQ({ id: 4, images: [] }), my_offer: { id: 7, price: 300, currency: 'EUR', message: 'Stare bună', status: 'pending', images: [] }, my_mark: null });
  await T.go('detail', 4); await tick(); s = text(T.body);
  t('oferta mea: preț în €, status, Modifică/Retrage', /300 €/.test(s) && /În așteptare/.test(s) && /Modifică oferta/.test(s) && /Retrage oferta/.test(s));
  // cerere închisă
  ctx.__api = async () => ({ request: REQ({ id: 4, images: [], status: 'closed' }), my_offer: null, my_mark: null });
  await T.go('detail', 4); await tick();
  t('cerere închisă: nu mai primește oferte', /nu mai primește oferte/.test(text(T.body)) && !/Trimite o ofertă/.test(text(T.body)));
  // cererea mea cu oferte
  ctx.__api = async (u) => u === '/api/requests/5' ? { request: REQ({ id: 5, mine: true }), my_offer: null } : u === '/api/requests/mine/5' ? { request: REQ({ id: 5, mine: true, images: [], vin: 'WAUZZZ8K9CA012345', ship_address: 'Str. X 1' }), editable: true,
    offers: [{ id: 1, seller_id: 8, seller_name: 'AutoDez', seller_rating: '4.8', seller_rating_n: 12, price: 200, currency: 'RON', message: 'Garanție 30 zile', status: 'pending', images: [] },
             { id: 2, seller_id: 9, seller_name: 'Piese SRL', price: 180, currency: 'RON', message: '', status: 'accepted', seller_phone: '0722123456', seller_full_name: 'Mihai P', images: [] }] } : { questions: [] };
  await T.go('detail', 5); await tick(); s = text(T.body);
  t('cererea mea: oferte primite (2), VIN și adresa vizibile', /Oferte primite \(2\)/.test(s) && /WAUZZZ8K9CA012345/.test(s) && /Str\. X 1/.test(s));
  t('ofertă în așteptare: Acceptă / Refuză; acceptată: contact vânzător', /Acceptă oferta/.test(s) && /Refuză/.test(s) && /0722123456/.test(s) && /★ 4\.8 \(12\)/.test(s));
  t('cerere editabilă: buton Modifică cererea + Închide', /Modifică cererea/.test(s) && /Închide cererea/.test(s));
  // formular nou
  T.st.edit = null; T.viewNew(); s = text(T.body);
  t('Cere oferte piese: câmpurile din AutoParts', ['Piesa căutată', 'Marca', 'Model', 'An', 'Motor', 'Serie șasiu', 'Județ', 'Localitate', 'Adresă de livrare', 'Trimite cererea', 'Adaugă încă o piesă'].every((x) => s.includes(x)));
  // Cererile mele
  ctx.__api = async () => ({ requests: [REQ({ id: 1, offers_count: 3, new_offers: 2, best_price: 150 }), REQ({ id: 2, title: 'Veche', status: 'closed' }), REQ({ id: 3, title: 'Rezolvată', status: 'matched' })] });
  await T.go('mine'); await tick(); s = text(T.body);
  t('Cererile mele: taburi Active/Inactive/Rezolvate cu număr', /Active \(1\)/.test(s) && /Inactive \(1\)/.test(s) && /Rezolvate \(1\)/.test(s) && /2 noi/.test(s) && /de la 150 lei/.test(s));
  T.st.mineTab = 'closed'; await T.go('mine'); await tick();
  t('tab Inactive: buton Reactivează', /Reactivează/.test(text(T.body)) && /Veche/.test(text(T.body)));
  // Ofertele mele (acceptată => contact cumpărător)
  ctx.__api = async () => ({ offers: [{ id: 1, request_id: 5, request_title: 'Far', price: 90, currency: 'RON', message: 'ok', status: 'accepted', created_at: iso(-1), buyer_name: 'Ana', buyer_phone: '0733111222', ship_address: 'Str. Y 2', vin: 'VIN123', req_thumb: null }, { id: 2, request_id: 6, request_title: 'Bară', price: 50, currency: 'RON', status: 'rejected', created_at: iso(-2) }] });
  await T.go('offers'); await tick(); s = text(T.body);
  t('Ofertele mele: statusuri + contact cumpărător doar la cea acceptată', /Acceptată/.test(s) && /Refuzată/.test(s) && /0733111222/.test(s) && /Str\. Y 2/.test(s) && (s.match(/0733111222/g) || []).length === 1);
  // Comenzi
  ctx.__api = async () => ({ orders: [{ id: 1, title: 'Far', price: 90, currency: 'RON', status: 'new', created_at: iso(-1), i_buy: false, other_name: 'Ana', other_phone: '0733' }, { id: 2, title: 'Bară', price: 50, currency: 'RON', status: 'shipped', created_at: iso(-1), i_buy: true, other_name: 'Dan' }] });
  await T.go('orders'); await tick(); s = text(T.body);
  t('Comenzi: vânzătorul confirmă, cumpărătorul „Am primit piesa”', /Confirmă comanda/.test(s) && /Am primit piesa/.test(s) && /Nouă/.test(s) && /Expediată/.test(s));
  // Întrebări
  ctx.__api = async () => ({ questions: [{ id: 1, request_title: 'Far', price: 90, currency: 'RON', body: 'Are garanție?', answer: null }, { id: 2, request_title: 'Bară', price: 50, currency: 'RON', body: 'Ce an?', answer: '2012' }] });
  await T.go('questions'); await tick(); s = text(T.body);
  t('Întrebări: cea fără răspuns are „Răspunde”, cea cu răspuns îl afișează', /Răspunde/.test(s) && /Răspunsul tău: 2012/.test(s));
  // Ofertele primite
  ctx.__api = async () => ({ offers: [{ id: 1, request_id: 5, request_title: 'Far', price: 90, currency: 'RON', status: 'pending', seller_name: 'AutoDez', seller_rating: '4.5', created_at: iso(-1) }] });
  await T.go('received'); await tick(); s = text(T.body);
  t('Ofertele primite: vânzător, preț, status', /AutoDez/.test(s) && /90 lei/.test(s) && /În așteptare/.test(s));
  // utilizator nelogat: paginile private cer autentificare
  let auth = 0; ctx.openAuth = () => auth++; const keep = ctx.me; ctx.me = null; await T.go('mine'); ctx.me = keep;
  t('nelogat: „Cererile mele” deschide autentificarea', auth === 1);
  console.log(`\n${ok} ok, ${bad} eșuate`); if (bad) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
