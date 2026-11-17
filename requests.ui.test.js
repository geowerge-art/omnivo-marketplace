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
  t('„Trimite-mi pe email” jos pe pagină', /Trimite-mi pe email notificările/.test(s));
  t('lista cere seen=new', calls.some((c) => /^\/api\/requests\?seen=new/.test(c[0])));
  // detaliu public, fără ofertă proprie: formular de ofertă
  ctx.__api = async (u) => ({ request: REQ({ id: 4, images: [], buyer_name: 'Ion' }), my_offer: null, my_mark: null });
  await T.go('detail', 4); await tick(); s = text(T.body);
  t('detaliu: formular „Trimite o ofertă” cu prețul tău', /Trimite o ofertă/.test(s) && /Prețul tău/.test(s) && /Cerută de Ion/.test(s));
  t('formular ofertă: „Atașează un anunț (opțional)”', /Atașează un anunț/.test(s));
  t('detaliu public: buton „Raportează cererea”', /Raportează cererea/.test(s));
  t('detaliu public: „Arată telefonul cumpărătorului”', /Arată telefonul cumpărătorului/.test(s));
  ctx.__api = async () => ({ request: REQ({ id: 4, images: [], buyer_name: 'Ion' }), my_offer: null, my_mark: null, reported: true });
  await T.go('detail', 4); await tick(); s = text(T.body);
  t('deja raportată: mesaj în loc de buton', /Ai raportat această cerere/.test(s) && !/Raportează cererea/.test(s));
  ctx.__api = async () => ({ request: REQ({ id: 4, images: [], buyer_name: 'Ion' }), my_offer: null, my_mark: null, blocked: 'me' });
  await T.go('detail', 4); await tick(); s = text(T.body);
  t('utilizator blocat: fără formular de ofertă și fără contact, cu explicație', /L-ai blocat/.test(s) && !/Trimite o ofertă/.test(s) && !/Arată telefonul/.test(s));
  // detaliu cu ofertă proprie în așteptare
  ctx.__api = async () => ({ request: REQ({ id: 4, images: [] }), my_offer: { id: 7, price: 300, currency: 'EUR', message: 'Stare bună', status: 'pending', images: [], listing_id: 77, listing: { id: 77, title: 'Far Audi A4 stânga', price: 250, currency: 'RON', thumb: '/t.jpg', status: 'approved' } }, my_mark: null });
  await T.go('detail', 4); await tick(); s = text(T.body);
  t('oferta mea: anunțul atașat (titlu, preț, „Vezi anunțul”)', /Far Audi A4 stânga/.test(s) && /250 lei · Vezi anunțul/.test(s));
  t('oferta mea: preț în €, status, Modifică/Retrage', /300 €/.test(s) && /În așteptare/.test(s) && /Modifică oferta/.test(s) && /Retrage oferta/.test(s));
  // cerere închisă
  ctx.__api = async () => ({ request: REQ({ id: 4, images: [], status: 'closed' }), my_offer: null, my_mark: null });
  await T.go('detail', 4); await tick();
  t('cerere închisă: nu mai primește oferte', /nu mai primește oferte/.test(text(T.body)) && !/Trimite o ofertă/.test(text(T.body)));
  // cererea mea cu oferte
  ctx.__api = async (u) => u === '/api/requests/5' ? { request: REQ({ id: 5, mine: true }), my_offer: null } : u === '/api/requests/mine/5' ? { request: REQ({ id: 5, mine: true, images: [], vin: 'WAUZZZ8K9CA012345', ship_address: 'Str. X 1' }), editable: true,
    offers: [{ id: 1, seller_id: 8, seller_name: 'AutoDez', seller_rating: '4.8', seller_rating_n: 12, price: 200, currency: 'RON', message: 'Garanție 30 zile', status: 'pending', images: [], listing: { id: 55, title: 'Far stânga Audi A4 B8', price: 190, currency: 'RON', status: 'sold' } },
             { id: 2, seller_id: 9, seller_name: 'Piese SRL', price: 180, currency: 'RON', message: '', status: 'accepted', seller_phone: '0722123456', seller_full_name: 'Mihai P', images: [] }] } : { questions: [] };
  await T.go('detail', 5); await tick(); s = text(T.body);
  t('cererea mea: oferte primite (2), VIN și adresa vizibile', /Oferte primite \(2\)/.test(s) && /WAUZZZ8K9CA012345/.test(s) && /Str\. X 1/.test(s));
  t('ofertă în așteptare: Acceptă / Refuză; acceptată: contact vânzător', /Acceptă oferta/.test(s) && /Refuză/.test(s) && /0722123456/.test(s) && /★ 4\.8 \(12\)/.test(s));
  t('oferta primită: anunțul vânzătorului (marcat „Vândut” când e vândut)', /Far stânga Audi A4 B8/.test(s) && /190 lei · Vândut/.test(s));
  t('cerere editabilă: buton Modifică cererea + Închide', /Modifică cererea/.test(s) && /Închide cererea/.test(s));
  t('cererea mea: „Raportează oferta” pe ofertele primite', (s.match(/Raportează oferta/g) || []).length === 2);
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
  // Comenzi: detalii, motiv, AWB, calificativ
  const ORDER = (o) => ({ id: 1, title: 'Far', price: 90, currency: 'RON', status: 'new', created_at: iso(-1), i_buy: false, other_name: 'Ana', phones: [{ phone: '0733111222', whatsapp: true }], make: 'Audi', model: 'A4', year: '2012', ship_address: 'Str. X 1', city: 'Cluj', county: 'Cluj', vin: 'WAUZZZ8K', extra_parts: [{ title: 'Oglindă', details: 'dreapta' }], offer_message: 'Garanție 30 zile', thumb: '/img/1', ...o });
  ctx.__api = async () => ({ orders: [ORDER({ listing: { id: 66, title: 'Far Audi A4 original', price: 300, currency: 'RON', status: 'approved' } }), ORDER({ id: 2, title: 'Bară', i_buy: true, status: 'shipped', unseen: true, awb: 'AWB123' }), ORDER({ id: 3, title: 'Capotă', i_buy: true, status: 'done', their_rating: { stars: 4, comment: 'Serios' } }),
    ORDER({ id: 4, title: 'Aripă', status: 'done', my_rating: { stars: 5, comment: 'Plătitor bun' } }), ORDER({ id: 5, title: 'Far dreapta', status: 'suspended', status_reason: 'Aștept piesa', seller_note: 'sună marți' })] });
  await T.go('orders'); await tick(); s = text(T.body);
  t('comandă nouă (vânzător): Confirmă, Expediată, Suspendă, Anulează, AWB / notă', /Confirmă comanda/.test(s) && /Marchează expediată/.test(s) && /Suspendă/.test(s) && /Anulează/.test(s) && /AWB \/ notă/.test(s));
  t('comandă: anunțul atașat la ofertă', /Far Audi A4 original/.test(s) && /300 lei · Vezi anunțul/.test(s));
  t('contact celălalt: telefon + WhatsApp; detalii: mașină, piese, livrare, VIN, ofertă', /0733111222/.test(s) && /WhatsApp/.test(s) && /Audi A4 2012/.test(s) && /Oglindă · dreapta/.test(s) && /Livrare: Str\. X 1, Cluj, Cluj/.test(s) && /VIN: WAUZZZ8K/.test(s) && /Oferta: Garanție 30 zile/.test(s));
  t('cumpărător, expediată: „Am primit piesa”, AWB și insigna „Actualizat”', /Am primit piesa/.test(s) && /AWB: AWB123/.test(s) && /Actualizat/.test(s));
  t('finalizată: cumpărătorul califică vânzătorul și vede calificativul primit', /Califică vânzătorul/.test(s) && /te-a calificat: ★★★★☆ · Serios/.test(s));
  t('finalizată: vânzătorul vede calificativul dat și poate modifica', /Calificativul tău pentru cumpărătorul: ★★★★★ · Plătitor bun/.test(s) && /Modifică calificativul/.test(s));
  t('suspendată: motiv + notă privată, se poate relua (Confirmă) dar nu suspenda din nou', /Motiv: Aștept piesa/.test(s) && /Notă privată: sună marți/.test(s));
  t('lista cere comenzile cu marcarea „văzut”', calls.some((c) => c[0] === '/api/orders?seen=buyer'));
  // interacțiuni: suspendare cu motiv obligatoriu, calificativ
  const walk = (n, f, out = []) => { if (f(n)) out.push(n); (n.children || []).forEach((c) => walk(c, f, out)); return out; };
  const card = (title) => walk(T.body, (n) => n.className && /rfq-quote/.test(n.className) && n.textContent.includes(title))[0];
  const btnIn = (n, txt) => walk(n, (x) => x.tagName === 'BUTTON' && x.textContent === txt)[0];
  const c1 = card('Far'); btnIn(c1, 'Suspendă').onclick(); await tick();
  const rf = walk(c1, (n) => n.tagName === 'FORM')[0]; t('„Suspendă” deschide formularul de motiv', !!rf);
  walk(rf, (n) => n.tagName === 'INPUT')[0].value = '';   // în browser un input nou are value ""
  calls.length = 0; rf.onsubmit({ preventDefault() {} }); await tick();
  t('fără motiv: nu se trimite nimic, apare eroarea', !calls.some((c) => /status/.test(c[0])) && /minimum 3 caractere/.test(rf.textContent));
  walk(rf, (n) => n.tagName === 'INPUT')[0].value = 'Piesa nu mai e pe stoc'; rf.onsubmit({ preventDefault() {} }); await tick();
  t('cu motiv: PATCH /api/orders/1/status', calls.some((c) => c[0] === '/api/orders/1/status' && c[1] === 'PATCH'));
  ctx.__api = async () => ({ orders: [ORDER({ id: 3, title: 'Capotă', i_buy: true, status: 'done' })] }); await T.go('orders'); await tick();
  const c3 = card('Capotă'); const sendBtn = btnIn(c3, 'Trimite calificativul'); calls.length = 0;
  sendBtn.onclick(); await tick(); t('calificativ fără stele: nu se trimite', !calls.some((c) => /rating/.test(c[0])) && /de la 1 la 5 stele/.test(c3.textContent));
  walk(c3, (n) => n.className === 'rqx-star')[3].onclick(); sendBtn.onclick(); await tick();
  t('calificativ cu 4 stele: PUT /api/orders/3/rating', calls.some((c) => c[0] === '/api/orders/3/rating' && c[1] === 'PUT'));
  ctx.__api = async () => ({ orders: [ORDER({ id: 1 })] }); await T.go('orders'); await tick();
  const c6 = card('Far'); btnIn(c6, 'AWB / notă').onclick(); await tick(); const df = walk(c6, (n) => n.tagName === 'FORM')[0]; calls.length = 0; df.onsubmit({ preventDefault() {} }); await tick();
  t('AWB / notă: PATCH /api/orders/1/details', calls.some((c) => c[0] === '/api/orders/1/details' && c[1] === 'PATCH'));
  // anunțuri ↔ cereri: Potrivite pentru mine, buton pe anunț, insigna din „Anunțurile mele”
  El.prototype.showModal = function () { this.open = true; }; El.prototype.close = function () { this.open = false; };
  const MATCH = { by_listing: [{ listing_id: 10, count: 2 }, { listing_id: 11, count: 1 }], requests: [{ id: 21, listing_id: 10, listing_title: 'Far Audi A4 B8', title: 'Far stânga', make: 'Audi', model: 'A4', year: '2012', county: 'Timiș', city: 'Timișoara', kind: 'ambele', extra_n: 1, created_at: iso(-1), expires_at: iso(5) }, { id: 22, listing_id: 11, listing_title: 'Alternator Bosch', title: 'Alternator', make: 'Bosch', county: 'Cluj', created_at: iso(-1), expires_at: iso(5), extra_n: 0 }] };
  ctx.__api = async (u) => (/\/api\/requests\/matching/.test(u) ? MATCH : { requests: [], counts: {} });
  await T.go('matching'); await tick(); s = text(T.body);
  t('„Potrivite pentru mine”: cererile potrivite cu anunțul meu', /Far stânga \+1 piesă/.test(s) && /Anunțul tău: Far Audi A4 B8/.test(s) && /Anunțul tău: Alternator Bosch/.test(s) && (s.match(/Se potrivește/g) || []).length === 2);
  t('tab „Potrivite pentru mine” pentru utilizatorii conectați', /Potrivite pentru mine/.test(ctx.$('rfqTabs').textContent));
  // click pe o cerere: formularul de ofertă are anunțul potrivit preselectat
  ctx.__api = async (u) => (/\/api\/listings\/mine/.test(u) ? { listings: [{ id: 10, title: 'Far Audi A4 B8', status: 'approved' }, { id: 11, title: 'Alternator Bosch', status: 'approved' }, { id: 12, title: 'Vechi', status: 'sold' }] }
    : /\/api\/requests\/21/.test(u) ? { request: REQ({ id: 21, images: [], buyer_name: 'Ion' }), my_offer: null, my_mark: null } : MATCH);
  ctx.__api0 = ctx.__api; await T.go('matching'); await tick();
  walk(T.body, (n) => n.className && /rfq-row/.test(n.className) && n.textContent.includes('Far stânga'))[0].onclick(); await tick(); await tick();
  const sel = walk(T.body, (n) => n.tagName === 'SELECT' && (n.children || []).some((o) => o._t === 'Fără anunț atașat'))[0];
  t('oferta pornită din „Potrivite”: anunțul 10 e preselectat, doar anunțurile publicate se oferă', !!sel && sel.value === '10' && (sel.children || []).map((o) => o._t).join('|') === 'Fără anunț atașat|Far Audi A4 B8|Alternator Bosch');
  await T.go('board'); T.st.view = 'board';
  t('după ce părăsești cererea, preselectarea se șterge', T.st.preListing === null);
  // buton pe pagina anunțului (cumpărător): precompletează formularul de cerere
  const box = new El('div'); ctx.rfqListingCta({ id: 10, title: 'Far Audi A4 B8', category_slug: 'piese-auto', status: 'approved' }, box, false);
  const cta = walk(box, (n) => n.tagName === 'BUTTON')[0]; t('anunț de piese: „Cere oferte pentru o piesă asemănătoare”', !!cta && /Cere oferte pentru o piesă asemănătoare/.test(cta.textContent));
  cta.onclick(); await tick();
  t('butonul deschide formularul de cerere completat cu titlul anunțului', T.st.view === 'new' && walk(T.body, (n) => n.tagName === 'INPUT' && n.value === 'Far Audi A4 B8').length === 1);
  const none = new El('div'); ctx.rfqListingCta({ id: 1, title: 'iPhone', category_slug: 'telefoane', status: 'approved' }, none, false); ctx.rfqListingCta({ id: 2, title: 'Far', category_slug: 'piese-auto', status: 'sold' }, none, false);
  t('fără buton la alte categorii sau anunțuri vândute', (none.children || []).length === 0);
  // proprietar: câte cereri se potrivesc
  ctx.__api = async () => ({ by_listing: [{ listing_id: 10, count: 2 }], requests: [] }); const ob = new El('div');
  ctx.rfqListingCta({ id: 10, title: 'Far Audi A4 B8', category_slug: 'piese-auto', status: 'approved' }, ob, true); await tick();
  t('proprietar: „2 cereri potrivite pentru acest anunț”', /2 cereri potrivite pentru acest anunț/.test(ob.textContent));
  ctx.__api = async () => ({ by_listing: [], requests: [] }); const ob2 = new El('div'); ctx.rfqListingCta({ id: 10, title: 'x', category_slug: 'piese-auto', status: 'approved' }, ob2, true); await tick();
  t('proprietar fără potriviri: nimic de afișat', (ob2.children || []).length === 0);
  // insigna din „Anunțurile mele”: o singură cerere către server pentru toate cardurile
  calls.length = 0; ctx.__api = async (u) => ({ by_listing: [{ listing_id: 10, count: 1 }, { listing_id: 11, count: 3 }], requests: [] });
  const c10 = new El('div'), c11 = new El('div'), c99 = new El('div'), cx = new El('div');
  ctx.rfqMatchBadge({ id: 10, category_slug: 'piese-auto' }, c10); ctx.rfqMatchBadge({ id: 11, category_slug: 'piese-auto' }, c11); ctx.rfqMatchBadge({ id: 99, category_slug: 'piese-auto' }, c99); ctx.rfqMatchBadge({ id: 10, category_slug: 'telefoane' }, cx); await tick();
  t('insigne: „1 cerere potrivită” / „3 cereri potrivite”, fără insignă la cele fără potriviri sau la alte categorii', /1 cerere potrivită/.test(c10.textContent) && /3 cereri potrivite/.test(c11.textContent) && !c99.children.length && !cx.children.length);
  t('insignele folosesc o singură cerere către server', calls.filter((c) => /\/api\/requests\/matching/.test(c[0])).length <= 1);
  // navigare rapidă: o pagină lentă nu o suprascrie pe cea deschisă între timp
  ctx.__api = (url) => new Promise((ok) => setTimeout(() => ok(/\/api\/requests\?/.test(url) ? { requests: [REQ({ id: 9, title: 'LENTA' })], counts: {} } : {}), 40));
  const slow = T.go('board'); T.go('new'); await new Promise((r) => setTimeout(r, 80)); await slow;
  t('pagina lentă („Ofertează piesele”) nu o înlocuiește pe cea nouă („Cere oferte piese”)', T.st.view === 'new' && /Piesa căutată/.test(text(T.body)) && !/LENTA/.test(text(T.body)));
  ctx.__api = (url) => new Promise((ok, no) => setTimeout(() => no(new Error('EROARE_LENTA')), 40));
  T.go('board'); T.go('new'); await new Promise((r) => setTimeout(r, 80));
  t('nici eroarea unei pagini vechi nu apare peste pagina nouă', /Piesa căutată/.test(text(T.body)) && !/EROARE_LENTA/.test(text(T.body)));
  // „Comenzi (n)” în tab când sunt comenzi actualizate
  ctx.rfqSummary.order_updates = 2; ctx.__api = async () => ({ requests: [], counts: { new: 0, all: 0, offered: 0, later: 0, ignored: 0 } }); await T.go('board'); await tick();
  t('tab „Comenzi (2)” pentru comenzile actualizate', /Comenzi \(2\)/.test(ctx.$('rfqTabs').textContent)); ctx.rfqSummary.order_updates = 0;
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
