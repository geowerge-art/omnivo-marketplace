/* Detectorul de conținut din titlul și descrierea anunțurilor. Funcție pură (fără bază de date), ca să poată fi testată ușor.
   Principiu: precizie înainte de toate. Mai bine lași să treacă un caz ciudat decât să blochezi un anunț corect
   (seria de șasiu, un an, un preț sau un cod de produs nu trebuie să arate ca un telefon).

   scan(text) întoarce { block: [{type, sample}], review: [{type, sample}] }
     block  = nu se publică (telefon, e-mail, link, trimitere pe aplicații de mesagerie, cuvinte interzise)
     review = se publică doar după verificare de către un moderator (formule tipice de fraudă) */

const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DIGIT_WORDS = { zero: 0, unu: 1, una: 1, doi: 2, doua: 2, trei: 3, patru: 4, cinci: 5, sase: 6, sapte: 7, opt: 8, noua: 9 };
const DIGIT_RE = new RegExp('\\b(' + Object.keys(DIGIT_WORDS).join('|') + ')\\b', 'g');
const SEP = '[\\s.\\-/()_,]';

/* numere de telefon: mobil 07xx xxx xxx, fix 02x/03x xxx xxxx, cu sau fără prefix +40 / 0040 / 40, cu separatori sau scrise cu litere */
function phones(folded) {
  const t = folded.replace(DIGIT_RE, (m) => String(DIGIT_WORDS[m]));
  const out = [];
  const re = new RegExp('(?:\\+|00)?\\d(?:' + SEP + '*\\d){8,12}', 'g');
  let m;
  while ((m = re.exec(t))) {
    let d = m[0].replace(/\D/g, '');
    if (d.startsWith('0040')) d = d.slice(4); else if (d.startsWith('40') && m[0].trim().startsWith('+')) d = d.slice(2); else if (d.startsWith('40') && d.length === 11) d = d.slice(2);
    if (d.length === 9) d = '0' + d;
    if (/^07\d{8}$/.test(d) || /^0[23]\d{8}$/.test(d)) out.push({ type: 'phone', sample: m[0].trim().slice(0, 24) });
  }
  return out;
}

const EMAIL_RE = /[a-z0-9._%+-]+\s*(?:@|\(\s*at\s*\)|\[\s*at\s*\]|\{\s*at\s*\}|\barond\b)\s*[a-z0-9-]+(?:\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\bpunct\b)\s*[a-z0-9-]+)*\s*(?:\.|\(\s*dot\s*\)|\[\s*dot\s*\]|\bpunct\b)\s*[a-z]{2,}/;
const LINK_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9][a-z0-9-]{1,}\.(?:ro|com|net|org|eu|info|xyz|ru|ws|me|io|shop|site|online|link|click|top|club|store)\b(?:\/\S*)?/;
const INTENT = '(?:scrie\\w*|contact\\w*|mesaj\\w*|vorbim|dm|nr|numar\\w*|tel\\w*|suna\\w*|apel\\w*|cauta\\w*|adauga\\w*)';
const APP = '(?:whats?\\s?app|watsap\\w*|whatsap\\w*|wapp|telegram|viber|signal|messenger|insta(?:gram)?|snap(?:chat)?)';
const MESSENGER_RE = new RegExp('\\bwa\\.me\\b|\\b' + INTENT + '[^.\\n]{0,25}\\b' + APP + '\\b|\\b' + APP + '\\b[^.\\n]{0,25}\\b' + INTENT + '\\b');

/* conținut interzis (se completează din variabila de mediu BLOCKED_WORDS, separată prin virgulă) */
const BANNED_DEFAULT = [
  'cocaina', 'heroina', 'metamfetamina', 'mdma', 'lsd', 'ecstasy', 'amfetamina',
  'permis fals', 'permis de conducere fals', 'buletin fals', 'pasaport fals', 'diploma falsa', 'acte false', 'certificat fals',
  'card clonat', 'carduri clonate', 'bani falsi', 'moneda falsa', 'organe de vanzare', 'rinichi de vanzare'
];
/* formule tipice de fraudă: nu blochează, dar anunțul merge la un moderator */
const FRAUD = [
  'avans', 'plata in avans', 'plata inainte', 'western union', 'moneygram', 'cod sms', 'codul din sms', 'cod primit prin sms', 'cod de verificare',
  'link de plata', 'link plata', 'curierul plateste', 'plateste taxa', 'taxa de livrare inainte', 'transfer bancar inainte', 'trimit banii intai'
];
const wordsRe = (list) => new RegExp('(?:^|[^a-z0-9])(' + [...new Set(list.map((w) => esc(fold(w).trim())).filter(Boolean))].join('|') + ')(?=$|[^a-z0-9])');

function makeScanner(extraBanned = []) {
  const bannedRe = wordsRe([...BANNED_DEFAULT, ...extraBanned]), fraudRe = wordsRe(FRAUD);
  return function scan(text) {
    const f = fold(text), block = [], review = [];
    block.push(...phones(f));
    let m = f.match(EMAIL_RE); if (m) block.push({ type: 'email', sample: m[0].trim().slice(0, 30) });
    m = f.match(LINK_RE); if (m) block.push({ type: 'link', sample: m[0].trim().slice(0, 30) });
    m = f.match(MESSENGER_RE); if (m) block.push({ type: 'messenger', sample: m[0].trim().slice(0, 30) });
    m = f.match(bannedRe); if (m) block.push({ type: 'banned', sample: m[1].slice(0, 30) });
    m = f.match(fraudRe); if (m) review.push({ type: 'fraud', sample: m[1].slice(0, 30) });
    return { block, review };
  };
}

/* mesaje din chat: doar avertisment pentru formule de fraudă (nu se blochează nimic) */
const CHAT_RISK = new RegExp(
  '(?:cod\\w*\\s+(?:din\\s+|primit\\s+|de\\s+)?(?:prin\\s+)?(?:sms|verificare|confirmare)|western\\s*union|moneygram|(?:plata|plateste|trimite)\\s+(?:in\\s+)?avans|avans\\b|link\\s+(?:de\\s+)?plata|plateste\\s+taxa|curierul\\s+plateste|\\bhttps?://)');
const chatRisk = (text) => CHAT_RISK.test(fold(text));

module.exports = { scan: makeScanner(), makeScanner, chatRisk, fold };
