/* Contorul din meniu, eticheta filei „Oferte primite”, anularea din listă și numărul de oferte în cerere. node requests.summary.ui.test.js */
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
ctx.window = ctx; vm.createContext(ctx);

let src = fs.readFileSync(__dirname + '/requests-ui.js', 'utf8').replace(/\}\)\(\);\s*$/, 'window.__t = { viewMine, viewDetail, tabs, st, build, go, get body() { return body; }, get dlg() { return dlg; } };\n})();');
vm.runInContext(src, ctx);
const T = ctx.__t; let ok = 0, bad = 0; const t = (n, p) => { p ? ok++ : bad++; console.log(`${p ? 'ok  ' : 'FAIL'} ${n}`); };
const text = (n) => n.textContent;
const future = new Date(Date.now() + 864e5).toISOString(), now = new Date().toISOString();
const REQ = (o) => ({ id: 1, part: 'Far', brand: 'VW', model: 'Golf', year: 2015, county: 'Cluj', status: 'open', accepting: true, expires_at: future, created_at: now, quotes: 0, best_ron: null, new_quotes: 0, new_answers: 0, thumb: null, delivery: true, kind: 'oricare', engine: '', vin: '', details: '', ...o });
const Q = (o) => ({ id: 1, price: 100, currency: 'RON', state: 'buna', warranty_days: 0, eta_days: null, shipping: null, status: 'sent', created_at: now, company: 'X', dealer_id: 9, dealer_county: 'Bihor', rating: null, rating_count: 0, verified: false, images: [], questions: [], ...o });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  T.build();
  // --- contorul din meniul contului ---
  els.accRfqN = new El('em');
  const sum = (o) => { ctx.__api = async (u) => (u === '/api/requests/summary' ? o : {}); return ctx.window.rfqSummaryRefresh(); };
  await sum({ open: 2, waiting: 5, new_quotes: 3, new_answers: 1 });
  t('meniu: 3 oferte noi + 1 răspuns nou → „4 noi”, vizibil și evidențiat', els.accRfqN.textContent === '4 noi' && els.accRfqN.hidden === false && els.accRfqN._cls.has('hot'));
  await sum({ open: 1, waiting: 1, new_quotes: 1, new_answers: 0 });
  t('meniu: un singur lucru nou → „1 nouă” (singular)', els.accRfqN.textContent === '1 nouă');
  await sum({ open: 2, waiting: 5, new_quotes: 0, new_answers: 0 });
  t('meniu: nimic nou, dar 5 oferte în așteptare → „5”, fără evidențiere', els.accRfqN.textContent === '5' && els.accRfqN.hidden === false && !els.accRfqN._cls.has('hot'));
  await sum({ open: 0, waiting: 0, new_quotes: 0, new_answers: 0 });
  t('meniu: nicio ofertă → contorul dispare', els.accRfqN.hidden === true && els.accRfqN.textContent === '');
  await sum({ open: 2, waiting: 5, new_quotes: 3, new_answers: 1 });
  // --- eticheta filei: se redesenează singură cât timp dialogul e deschis ---
  T.dlg.open = true; await sum({ open: 2, waiting: 5, new_quotes: 3, new_answers: 1 });
  const labels = () => els.rfqTabs.children.map(text);
  t('fila „Oferte primite” arată câte sunt noi: „Oferte primite (4)”', labels().includes('Oferte primite (4)'));
  t('fila „Cererile mele” rămâne neschimbată', labels().includes('Cererile mele'));
  await sum({ open: 0, waiting: 0, new_quotes: 0, new_answers: 0 });
  t('fără nimic nou, fila nu are număr', labels().includes('Oferte primite') && !labels().some((l) => /\(\d+\)/.test(l)));
  // --- deconectat: contoarele se golesc ---
  await sum({ open: 2, waiting: 5, new_quotes: 3, new_answers: 1 });
  ctx.me = null; const calls0 = calls.length; await ctx.window.rfqSummaryRefresh();
  t('deconectat: contorul se golește și nu cheamă serverul', els.accRfqN.hidden === true && calls.length === calls0 && ctx.window.rfqSummary.new_quotes === 0);
  ctx.me = { id: 5, role: 'user' };
  // --- eroare de rețea: contorul rămâne cum era ---
  await sum({ open: 2, waiting: 5, new_quotes: 3, new_answers: 1 });
  ctx.__api = async () => { throw new Error('offline'); }; await ctx.window.rfqSummaryRefresh();
  t('rețea căzută: contorul nu se pierde', els.accRfqN.textContent === '4 noi');

  // --- „Cererile mele”: anularea direct din listă ---
  ctx.__api = async (u) => (u === '/api/requests/mine' ? { requests: [REQ({ id: 1, quotes: 3, best_ron: 100, new_quotes: 2 }), REQ({ id: 2, status: 'awarded', quotes: 1 }), REQ({ id: 3, status: 'expired' })] } : {});
  await T.viewMine();
  const links = T.body.all((c) => c.className.includes('rfq-cancel'));
  t('doar cererea deschisă are „Anulează cererea” în listă (nu cea cu câștigător sau expirată)', links.length === 1 && text(links[0]) === 'Anulează cererea');
  t('lista arată „3 oferte” și „2 oferte noi”', /3 oferte/.test(text(T.body)) && /2 oferte noi/.test(text(T.body)));
  calls.length = 0; ctx.confirm = () => false; await links[0].onclick();
  t('dacă renunți la confirmare, nu se anulează nimic', !calls.some((c) => c[1] === 'POST'));
  ctx.confirm = () => true; ctx.__api = async (u) => (u === '/api/requests/mine' ? { requests: [REQ({ id: 1, status: 'cancelled' })] } : {}); await links[0].onclick();
  t('confirmat: cheamă POST /api/requests/1/cancel', calls.some((c) => c[0] === '/api/requests/1/cancel' && c[1] === 'POST'));
  t('după anulare lista se reîncarcă (fără link de anulare)', T.body.all((c) => c.className.includes('rfq-cancel')).length === 0);

  // --- cererea deschisă: câte oferte ai primit ---
  const detail = (quotes) => { ctx.__api = async (u) => (u === '/api/requests/7' ? { request: REQ({ id: 7 }), quotes, photos: [] } : {}); return T.viewDetail(7); };
  await detail([Q({ id: 1, company: 'A' }), Q({ id: 2, company: 'B' }), Q({ id: 3, company: 'C' })]);
  t('în cerere, sus: „3 oferte primite”', /3 oferte primite/.test(text(T.body)));
  await detail([Q({ id: 1, company: 'A' })]);
  t('o singură ofertă: „1 ofertă primită”', /1 ofertă primită/.test(text(T.body)));
  await detail([]);
  t('fără oferte: nu apare numărătoarea, ci mesajul „Nicio ofertă încă”', !/primit/.test(text(T.body).replace(/Dezmembrătorii/, '')) && /Nicio ofertă încă/.test(text(T.body)));

  // --- actualizarea live (evenimentul „rfq”) ---
  calls.length = 0; ctx.__api = async (u) => (u === '/api/requests/summary' ? { open: 1, waiting: 1, new_quotes: 1, new_answers: 0 } : /received/.test(u) ? { offers: [] } : {});
  T.dlg.open = true; T.st.view = 'received'; T.body.contains = () => false; ctx.window.rfqRefresh(); await sleep(10);
  t('la o ofertă nouă, contorul se reîmprospătează', calls.some((c) => c[0] === '/api/requests/summary'));
  t('și fila „Oferte primite” se reîncarcă (înainte lipsea din listă)', calls.some((c) => /\/api\/requests\/received/.test(c[0])));
  console.log(`\n${ok} trecute, ${bad} eșuate`); if (bad) process.exit(1);
})();
