/* Rulează admin-ui.js într-un DOM simulat și verifică fila „Cereri piese”: cereri, oferte, comenzi și acțiunile de moderare. */
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
ctx.window = ctx; ctx.me = { id: 1, role: 'admin' }; ctx.show = () => {}; ctx.price = (n) => String(n); ctx.openDetail = async () => {}; ctx.openEdit = () => {}; ctx.openLightbox = () => {};
vm.createContext(ctx);
let src = fs.readFileSync(__dirname + '/admin-ui.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__t = { vReqs, st, ACT, TABS };\n})();');
vm.runInContext(src, ctx);
const T = ctx.__t, tick = () => new Promise((r) => setTimeout(r, 10)); let ok = 0, bad = 0;
const t = (n, p) => { p ? ok++ : bad++; console.log((p ? 'ok   ' : 'FAIL ') + n); };
const iso = new Date().toISOString();
(async () => {
  t('fila „Cereri piese” e în meniul de admin', T.TABS.some(([k, n]) => k === 'reqs' && n === 'Cereri piese'));
  t('acțiunile noi au etichete în jurnal', ['request_close', 'request_reopen', 'request_delete', 'offer_remove'].every((k) => T.ACT[k]));
  const b = new El('div'); const urls = [];
  ctx.__api = async (u) => { urls.push(u);
    if (/^\/api\/admin\/requests\?/.test(u)) return { rows: [{ id: 5, title: 'Far stânga', make: 'Audi', model: 'A4', year: '2012', county: 'Timiș', city: 'Timișoara', status: 'open', created_at: iso, owner: 'ion', offers_count: 2, extra_n: 1 }, { id: 6, title: 'Bară', status: 'closed', created_at: iso, owner: 'ana', offers_count: 0, extra_n: 0 }] };
    if (/^\/api\/admin\/offers\?/.test(u)) return { rows: [{ id: 3, price: 150, currency: 'RON', message: 'ok', status: 'pending', created_at: iso, request_title: 'Far', seller: 'dez', buyer: 'ion' }, { id: 4, price: 20, currency: 'EUR', status: 'accepted', created_at: iso, request_title: 'Bară', seller: 'x', buyer: 'y' }] };
    if (/^\/api\/admin\/rfq-orders\?/.test(u)) return { rows: [{ id: 1, title: 'Far', price: 150, currency: 'RON', status: 'shipped', created_at: iso, buyer: 'ion', seller: 'dez' }] };
    if (/^\/api\/admin\/requests\/5$/.test(u)) return { request: { id: 5, title: 'Far stânga', extra_parts: [{ title: 'Oglindă', details: 'dreapta' }], make: 'Audi', owner: 'ion', owner_email: 'i@x.ro', images: [], vin: 'WAUZZZ' }, offers: [{ id: 3, seller: 'dez', price: 150, currency: 'RON', message: 'Garanție', status: 'pending', created_at: iso, images: [] }] };
    return { rows: [] }; };
  await T.vReqs(b); await tick(); let s = b.textContent;
  t('cereri: titlu, +1 piesă, status, solicitant, nr. oferte', /Far stânga \+1/.test(s) && /Deschisă/.test(s) && /Închisă/.test(s) && /@ion · 2 oferte/.test(s));
  t('acțiuni: Închide pe cea deschisă, Redeschide pe cea închisă, Șterge (admin)', /Închide/.test(s) && /Redeschide/.test(s) && /Șterge/.test(s));
  t('lista cere cereri deschise implicit', urls.some((u) => /^\/api\/admin\/requests\?status=open/.test(u)));
  T.st.reqSub = 'offers'; await T.vReqs(b); await tick(); s = b.textContent;
  t('oferte: preț, € , vânzător către cumpărător, „Scoate oferta” doar la cea în așteptare', /150 lei · Far/.test(s) && /20 € · Bară/.test(s) && /@dez către @ion/.test(s) && (s.match(/Scoate oferta/g) || []).length === 1);
  T.st.reqSub = 'orders'; await T.vReqs(b); await tick(); s = b.textContent;
  t('comenzi: status și părți', /Expediată/.test(s) && /cumpărător @ion · vânzător @dez/.test(s));
  ctx.__api = async (u) => { urls.push(u); if (/rfq-overview/.test(u)) return { open_reports: 2 };
    return { rows: [{ id: 1, kind: 'request', reason: 'contact', details: 'are telefon', status: 'open', created_at: iso, target_title: 'Far', reporter: 'ana', target_user: 'ion', target_status: 'open', same_target: 3 },
                    { id: 2, kind: 'offer', reason: 'inselatorie', details: '', status: 'open', created_at: iso, target_title: 'Bară', price: 99, currency: 'RON', reporter: 'dan', target_user: 'dez', target_status: 'pending', same_target: 1 },
                    { id: 3, kind: 'offer', reason: 'spam', status: 'resolved', created_at: iso, target_title: 'Alta', price: 5, currency: 'EUR', reporter: 'x', target_user: 'y', target_status: null, same_target: 1, admin_note: 'ok' }] }; };
  T.st.reqSub = 'reports'; await T.vReqs(b); await tick(); s = b.textContent;
  t('raportări: cerere/ofertă, motiv, părți, câte raportări pe aceeași țintă', /Cerere: Far/.test(s) && /Ofertă: Bară · 99 lei/.test(s) && /Date de contact/.test(s) && /de la @ana · către @ion/.test(s) && /3 raportări pe aceeași țintă/.test(s));
  t('acțiuni: Închide cererea doar pe cerere deschisă, Scoate oferta doar pe ofertă în așteptare', (s.match(/Închide cererea/g) || []).length === 1 && (s.match(/Scoate oferta/g) || []).length === 1);
  t('raportare rezolvată: fără butoane, cu notă și „Țintă ștearsă”', /Țintă ștearsă/.test(s) && /Notă: ok/.test(s));
  t('lista cere raportările deschise și insigna', urls.some((u) => /^\/api\/admin\/rfq-reports\?status=open/.test(u)) && urls.includes('/api/admin/rfq-overview'));
  console.log(`\n${ok} ok, ${bad} eșuate`); if (bad) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
