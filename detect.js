/* Detectarea categoriei din titlu. Funcție pură (fără bază de date), ca să poată fi testată cu titluri reale.
   Semnale: cuvinte-cheie din baza de date + expresii + specificații (CP, tdi, km, GB, inch…).
   Ideea centrală: un cuvânt care numește o PIESĂ (far, bară) contează mai mult decât marca, iar specificațiile
   unui vehicul întreg (tdci, 109cp, km) mută anunțul spre „Autoturisme”. Când nu se poate decide, întrebăm. */

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STOP = new Set(['de', 'la', 'cu', 'si', 'pe', 'in', 'un', 'o', 'al', 'ale', 'din', 'sau', 'fara', 'pentru', 'vand', 'vind', 'vandut', 'ofer', 'urgent']);

/* Piese care, scrise în titlu, înseamnă aproape sigur o piesă. */
const STRONG_PARTS = new Set(('far faruri bara capota aripa usa usi portiera oglinda amortizor amortizoare placute discuri jante anvelope cauciucuri ' +
  'roti radiator alternator electromotor injector injectoare turbina planetara parbriz stop stopuri bascula esapament catalizator bujii bobina cardan ' +
  'punte tampon grila proiector lampa lampi ambreiaj pompa distributie dezmembrez dezmembrari').split(' '));
/* Cuvinte care pot fi și piesă, și descrierea unei mașini întregi („motor 1.6”, „cutie automată”). */
const DUAL_PARTS = new Set('motor motorul cutie interior scaune caroserie bord volan'.split(' '));

/* Specificații care descriu un vehicul întreg (tari) sau doar îl sugerează (slabe). */
/* Cuvântul care numește obiectul vândut („televizor”, „laptop”) decide mai mult decât marca („samsung”, „lenovo”). */
const HEAD = { telefoane: 'telefon smartphone iphone', 'tv-audio': 'televizor televizoare soundbar', laptopuri: 'laptop notebook macbook',
  console: 'consola playstation xbox', electrocasnice: 'frigider aragaz aspirator cuptor uscator congelator', biciclete: 'bicicleta trotineta',
  canapele: 'canapea fotoliu', carucioare: 'carucior', jucarii: 'jucarie lego' };
const SPEC_STRONG = [
  /\b\d{2,3}\s?(cp|hp|cai)\b/, /\b(tdi|tdci|dci|hdi|cdi|crdi|tsi|tfsi|fsi|jtd|jtdm|multijet|cdti|bluehdi|ecoboost|ecotec|vtec|mpi|d4d|tce|dti|skyactiv)\b/,
  /\b\d[\d. ]{1,8}\s?km\b/, /\b(inmatriculat|neinmatriculat|itp|rca|proprietar|avariat|accidentat|fiscal)\b/, /\beuro ?[3-6]\b/
];
const SPEC_WEAK = [/\ban\s?(19[6-9]\d|20[0-3]\d)\b/, /\b[1-6]\.\d\b/];

/* Expresii: [regex, slug, scor]. Textul potrivit e scos din titlu ca „mașină” să nu ducă spre Auto. */
const PHRASES = [
  [/masina (de )?(spalat|uscat|cusut|calcat|cafea|paine|tocat|gatit|vase|rufe)/, 'electrocasnice', 8],
  [/masina (de )?(tuns|gaurit|insurubat|slefuit|debitat|taiat|frezat|zidit)/, 'unelte', 8],
  [/(placute|discuri|saboti|tamburi|etrieri) (de )?frana/, 'piese-auto', 9],
  [/filtru (de )?(ulei|aer|polen|motorina|benzina|habitaclu)/, 'piese-auto', 9],
  [/(kit|set|curea|lant) (de )?distributie/, 'piese-auto', 9],
  [/cutie (de )?viteze/, 'piese-auto', 8],
  [/smart tv|tv (led|oled|qled|smart)/, 'tv-audio', 6],
  [/aer conditionat/, 'electrocasnice', 6],
  [/telefon (mobil|smartphone)/, 'telefoane', 4]
];
/* Tipare numerice care trădează tipul de produs. */
const PATTERNS = [
  [/\b\d{2,4}\s?gb\b|\bdual sim\b|\b5g\b/, 'telefoane', 2], [/\b\d{2,4}\s?gb\b/, 'laptopuri', 1],
  [/\b(ssd|hdd|ddr[345]|ryzen|core i[3579]|i[3579][ -]?\d{3,5})\b/, 'laptopuri', 4],
  [/\b\d{2,3}\s?(inch|toli)\b|\b(4k|uhd|oled|qled|hdmi)\b/, 'tv-audio', 4],
  [/\b\d{1,2}([.,]\d)?\s?kg\b|\bbtu\b/, 'electrocasnice', 2]
];


function detect(title, leaves) {
  const orig = fold(title);
  const bySlug = new Map(leaves.map((l) => [l.slug, l]));
  const score = new Map(leaves.map((l) => [l.slug, 0]));
  const add = (slug, n) => { if (score.has(slug)) score.set(slug, score.get(slug) + n); };

  let work = orig, strongParts = 0, weakExtra = 0;
  /* „… an 2016 motor 1.6”, „… cutie manuala”: descriu mașina, nu sunt piese (dacă nu stau chiar la începutul titlului). */
  work = work.replace(/\b(motor|motorizare)\s?\d[.,]\d|\bcutie\s(manuala|automata|automat|manual|secventiala)\b/g, (m, a, b, off) => {
    if (off > 6) { weakExtra++; return ' '; }
    return m;
  });
  for (const [re, slug, n] of PHRASES) {
    if (re.test(work)) { add(slug, n); if (slug === 'piese-auto') strongParts++; work = work.replace(re, ' '); }
  }
  for (const [re, slug, n] of PATTERNS) if (re.test(orig)) add(slug, n);

  const tokens = [...new Set(work.split(/[^a-z0-9]+/).filter((w) => w.length >= 2 && !STOP.has(w)))];
  for (const l of leaves) {
    const kw = new Set(l.keywords.split(' ').filter((k) => k && !STOP.has(k)));
    for (const w of tokens) for (const k of kw) {
      if (w === 'masina' && l.slug !== 'autoturisme') continue;
      if (w === k) add(l.slug, 3);
      else if (k.length >= 4 && w.length >= 4 && (w.startsWith(k) || k.startsWith(w))) add(l.slug, 2);
    }
  }

  for (const [slug, words] of Object.entries(HEAD)) for (const w of words.split(' ')) if (tokens.includes(w)) add(slug, 3);

  /* Piesă sau mașină întreagă? */
  strongParts += tokens.filter((w) => STRONG_PARTS.has(w)).length;
  const dual = tokens.filter((w) => DUAL_PARTS.has(w));
  const partCtx = /\b(pentru|compatibil|se potriveste|potrivit)\b/.test(orig);
  const strongSpec = SPEC_STRONG.filter((re) => re.test(orig)).length;
  const weakSpec = SPEC_WEAK.filter((re) => re.test(orig)).length + weakExtra;
  const carHit = (score.get('autoturisme') || 0) > 0;
  const vehicleish = carHit || strongSpec > 0 || weakSpec > 0;
  let ask = null;

  if (bySlug.has('autoturisme') && bySlug.has('piese-auto')) {
    const isPart = strongParts > 0 || (partCtx && carHit);
    if (isPart) {
      add('piese-auto', 8 * Math.min(strongParts + (partCtx ? 1 : 0), 2)); add('autoturisme', -4);
    } else if (dual.length && vehicleish) {
      const mx = Math.max(score.get('autoturisme'), score.get('piese-auto'), 6);
      score.set('autoturisme', mx); score.set('piese-auto', mx);
      const car = bySlug.get('autoturisme'), part = bySlug.get('piese-auto');
      ask = { question: 'Vinzi mașina întreagă sau doar o piesă?', options: [
        { label: 'Mașina întreagă', id: car.id, slug: car.slug, name: car.name, parent: car.parent_name },
        { label: `Doar piesa („${dual[0]}”)`, id: part.id, slug: part.slug, name: part.name, parent: part.parent_name }] };
    } else {
      if (strongSpec) { add('autoturisme', 5 * Math.min(strongSpec, 3)); add('piese-auto', -2); }
      if (weakSpec) add('autoturisme', 2 * Math.min(weakSpec, 2));
    }
  }

  const ranked = leaves.map((l) => ({ id: l.id, slug: l.slug, name: l.name, parent: l.parent_name, score: score.get(l.slug) }))
    .filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  const best = ranked.length ? ranked[0].score : 0;
  ranked.splice(0, ranked.length, ...ranked.filter((c, i) => i === 0 || c.score >= Math.max(3, best * 0.4)).slice(0, 3));
  const confident = !ask && ranked.length > 0 && ranked[0].score >= 3 && (!ranked[1] || ranked[1].score * 2 <= ranked[0].score);
  return { suggestions: ranked, ask, confident };
}

module.exports = { detect, fold };
