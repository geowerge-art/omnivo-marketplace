/* Pagini publice: termeni, confidențialitate, cookie-uri, siguranță, ajutor, contact (+ API-ul formularului de contact).
   Textele legale sunt un punct de plecare: datele firmei vin din variabilele de mediu LEGAL_*, iar documentele trebuie verificate de un jurist. */
const express = require('express');
const db = require('./db');
const config = require('./config');
const { ah } = require('./common');
const { sendMail } = require('./mail');
const { createThrottle, clientIp } = require('./security');
const { esc } = require('./seo');

const UPDATED = '10 noiembrie 2026';
const TODO = '[de completat]';
const who = {
  name: esc(config.LEGAL_NAME || TODO), cui: esc(config.LEGAL_CUI || TODO), addr: esc(config.LEGAL_ADDRESS || TODO),
  mail: esc(config.SUPPORT_EMAIL || config.ADMIN_EMAIL || TODO)
};
const operator = `<p><b>${who.name}</b>, CUI ${who.cui}, cu sediul în ${who.addr}, e-mail <b>${who.mail}</b> (denumită în continuare „Omnivo”, „noi”).</p>`;

const NAV = [['termeni', 'Termeni'], ['confidentialitate', 'Confidențialitate'], ['cookies', 'Cookie-uri'], ['siguranta', 'Siguranță'], ['ajutor', 'Ajutor'], ['contact', 'Contact']];
const layout = (title, desc, body, script) => `<!DOCTYPE html>
<html lang="ro">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)} | Omnivo</title>
  <meta name="description" content="${esc(desc)}">
  <link rel="stylesheet" href="/style.css">
</head>
<body class="doc-page">
  <header class="doc-head"><a class="logo" href="/">omnivo<span>.ro</span></a><a class="doc-back" href="/">← Înapoi la anunțuri</a></header>
  <main class="doc">
    ${body}
  </main>
  <footer class="doc-foot"><nav aria-label="Pagini">${NAV.map(([k, t]) => `<a href="/${k}">${t}</a>`).join('')}</nav><small>© 2026 Omnivo</small></footer>
  ${script ? `<script src="${script}"></script>` : ''}
</body>
</html>`;

const P = {};

P.termeni = ['Termeni și condiții', 'Regulile de utilizare a platformei Omnivo.', `
<h1>Termeni și condiții</h1>
<p class="doc-upd">Ultima actualizare: ${UPDATED}</p>
<h2>1. Cine suntem</h2>${operator}
<h2>2. Ce este Omnivo</h2>
<p>Omnivo este o platformă de anunțuri care pune în legătură persoane care vând și persoane care cumpără. Noi oferim spațiul și instrumentele (publicare, căutare, mesaje). Contractul de vânzare se încheie direct între vânzător și cumpărător; Omnivo nu este parte din tranzacție, nu deține și nu livrează produsele și nu garantează calitatea, legalitatea sau disponibilitatea lor. Verificăm anunțurile prin moderare, dar nu putem verifica fiecare anunț în parte.</p>
<h2>3. Contul</h2>
<ul><li>Trebuie să ai cel puțin 18 ani și să furnizezi date reale.</li><li>Ești responsabil de păstrarea parolei și de tot ce se întâmplă în contul tău.</li><li>Ne poți cere oricând ștergerea contului.</li></ul>
<h2>4. Publicarea anunțurilor</h2>
<ul><li>Anunțul trebuie să fie adevărat, la categoria potrivită, cu preț și descriere corecte, iar pozele să îți aparțină sau să ai dreptul să le folosești.</li><li>Anunțurile pot fi verificate de moderatori, editate pentru încadrare corectă, respinse sau blocate, cu motivul comunicat.</li><li>Un anunț rămâne publicat 30 de zile și poate fi reînnoit. Poți avea un număr maxim de anunțuri active, în funcție de planul contului.</li></ul>
<h2>5. Conținut interzis</h2>
<p>Nu sunt permise: bunuri sau servicii ilegale; arme, muniție și explozibili; droguri și substanțe interzise; medicamente cu prescripție; produse contrafăcute; animale și specii protejate; conținut pentru adulți sau care exploatează persoane; date personale ale altor persoane; anunțuri înșelătoare, duplicate sau care urmăresc fraudarea; orice conținut care încalcă drepturi de autor, mărci sau legea română și europeană.</p>
<h2>6. Tranzacțiile dintre utilizatori</h2>
<p>Plata, predarea, livrarea, garanția și returnarea se stabilesc între vânzător și cumpărător, care răspund pentru respectarea legii (inclusiv a regulilor privind consumatorii, atunci când sunt aplicabile). Citește <a href="/siguranta">sfaturile de siguranță</a>: nu trimite bani în avans către necunoscuți și nu comunica coduri primite prin SMS sau date ale cardului.</p>
<h2>7. Mesaje și comportament</h2>
<p>Mesajele sunt destinate discuțiilor despre anunțuri. Sunt interzise hărțuirea, amenințările, limbajul urât, spam-ul și încercările de fraudă. Poți bloca un utilizator și poți raporta anunțuri sau comportamente.</p>
<h2>8. Planuri de cont</h2>
<p>Contul poate avea un plan (Basic, Standard, Silver, Gold, Titanium) care stabilește limite și facilități, de exemplu numărul de anunțuri active, promovările simultane și istoricul statisticilor. Planurile superioare se acordă de echipa Omnivo; condițiile, durata și eventualul preț îți sunt comunicate înainte de activare. Putem modifica limitele planurilor, anunțându-te în prealabil.</p>
<h2>9. Drepturi asupra conținutului</h2>
<p>Rămâi titularul conținutului pe care îl postezi. Ne acorzi dreptul gratuit și neexclusiv de a-l afișa și de a-l folosi în platformă (inclusiv în rezultate de căutare și la partajarea anunțului) cât timp anunțul este publicat.</p>
<h2>10. Suspendarea și ștergerea contului</h2>
<p>Putem restricționa, suspenda sau șterge un cont care încalcă acești termeni sau legea, cu motivare și, acolo unde e posibil, cu posibilitatea de a răspunde.</p>
<h2>11. Răspunderea noastră</h2>
<p>În limitele permise de lege, Omnivo nu răspunde pentru conținutul anunțurilor, pentru fapte ale utilizatorilor sau pentru pagubele rezultate din tranzacții între utilizatori. Nu limităm răspunderea acolo unde legea nu permite acest lucru.</p>
<h2>12. Modificări</h2>
<p>Putem actualiza acești termeni. Vom afișa data ultimei actualizări, iar schimbările importante ți le vom comunica.</p>
<h2>13. Reclamații și contact</h2>
<p>Scrie-ne la <b>${who.mail}</b> sau prin <a href="/contact">formularul de contact</a>. Ca utilizator consumator poți depune sesizări și la autoritățile competente (de exemplu ANPC).</p>
<h2>14. Legea aplicabilă</h2>
<p>Acești termeni sunt guvernați de legea română. Disputele se soluționează amiabil, iar în caz contrar de instanțele române competente.</p>`];

P.confidentialitate = ['Politica de confidențialitate', 'Ce date prelucrăm, de ce, cât timp și ce drepturi ai.', `
<h1>Politica de confidențialitate</h1>
<p class="doc-upd">Ultima actualizare: ${UPDATED}</p>
<p>Prelucrăm datele personale conform Regulamentului (UE) 2016/679 (GDPR) și legislației române. Operatorul datelor este:</p>${operator}
<h2>Ce date prelucrăm</h2>
<ul>
<li><b>Cont:</b> nume, nickname, e-mail, parola (stocată doar sub formă criptată, nu în clar), telefon (opțional).</li>
<li><b>Anunțuri:</b> textul, pozele, prețul, localitatea și, opțional, adresa pe care o introduci.</li>
<li><b>Mesaje:</b> conversațiile cu alți utilizatori și atașamentele trimise.</li>
<li><b>Activitate în cont:</b> anunțuri salvate la favorite, căutări salvate, notificări, recenzii.</li>
<li><b>Date tehnice:</b> adresa IP, tipul browserului și momentul accesului, folosite pentru securitate, limitarea abuzurilor și funcționarea serviciului.</li>
</ul>
<h2>De ce le folosim și pe ce temei</h2>
<ul>
<li><b>Furnizarea serviciului</b> (cont, anunțuri, mesaje, notificări), pe baza executării contractului.</li>
<li><b>Securitate, prevenirea fraudelor și moderare</b>, pe baza interesului nostru legitim de a ține platforma sigură.</li>
<li><b>Statistici agregate</b> (de exemplu numărul de vizualizări ale unui anunț), pe baza interesului legitim.</li>
<li><b>Obligații legale</b>, când legea ne cere să păstrăm sau să transmitem date.</li>
<li>Nu trimitem mesaje de marketing fără acordul tău.</li>
</ul>
<h2>Cine poate vedea datele</h2>
<ul><li>Nickname-ul, anunțurile și recenziile sunt publice.</li><li>Telefonul se afișează doar dacă alegi să îl arăți pe anunțuri.</li><li>Mesajele sunt vizibile doar pentru participanții la conversație (și pentru moderatori, doar dacă raportezi un abuz sau legea o cere).</li></ul>
<h2>Cu cine le partajăm</h2>
<p>Folosim furnizori care prelucrează date în numele nostru: găzduire a aplicației, bază de date și stocare de fișiere, trimitere de e-mailuri. Ei acționează doar conform instrucțiunilor noastre. Dacă un furnizor se află în afara Spațiului Economic European, transferul se face cu garanțiile prevăzute de GDPR (de exemplu clauze contractuale standard). Putem transmite date autorităților, când suntem obligați legal.</p>
<h2>Cât păstrăm datele</h2>
<p>Păstrăm datele cât timp ai cont și cât e necesar scopurilor de mai sus. Când ștergi contul, ștergem anunțurile și mesajele tale, cu excepția datelor pe care legea ne obligă să le păstrăm sau pe care le folosim pentru a ne apăra drepturile, pe perioade limitate. Jurnalele tehnice se păstrează pe perioade scurte.</p>
<h2>Drepturile tale</h2>
<p>Ai dreptul de acces, rectificare, ștergere, restricționare, portabilitate și opoziție, precum și dreptul de a-ți retrage consimțământul oricând. Scrie-ne la <b>${who.mail}</b>; îți răspundem în cel mult 30 de zile. Poți depune plângere la Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal (ANSPDCP, dataprotection.ro).</p>
<h2>Securitate</h2>
<p>Folosim conexiuni criptate (HTTPS), parole stocate criptat, acces limitat la date și măsuri de limitare a abuzurilor. Niciun sistem nu e perfect; dacă apare un incident care te afectează, vom acționa conform legii.</p>
<h2>Minori</h2>
<p>Serviciul este destinat persoanelor de peste 18 ani.</p>
<h2>Modificări</h2>
<p>Dacă actualizăm această politică, afișăm aici data noii versiuni.</p>`];

P.cookies = ['Politica de cookie-uri', 'Ce cookie-uri și date locale folosește Omnivo.', `
<h1>Politica de cookie-uri</h1>
<p class="doc-upd">Ultima actualizare: ${UPDATED}</p>
<p>În prezent, Omnivo folosește doar elemente <b>strict necesare</b> funcționării. Nu folosim cookie-uri de publicitate sau de urmărire între site-uri, de aceea nu afișăm un banner de consimțământ.</p>
<h2>Cookie-ul de sesiune</h2>
<p>Cookie-ul <code>session</code> te păstrează autentificat. Este setat doar după ce intri în cont, este de tip HttpOnly (nu poate fi citit de scripturi) și expiră după o perioadă limitată (cel mult 30 de zile). Fără el nu te putem menține conectat.</p>
<h2>Date stocate local în browser</h2>
<p>Păstrăm local, pe dispozitivul tău, câteva preferințe și istoricul anunțurilor deschise, pentru secțiuni precum „Văzute recent”. Aceste date nu sunt trimise către publicitari. Le poți șterge din pagina principală (butonul „Șterge istoricul”) sau din setările browserului.</p>
<h2>Dacă se schimbă ceva</h2>
<p>Dacă vom introduce statistici externe sau publicitate, vom actualiza această pagină și vom cere acordul tău înainte de a seta astfel de cookie-uri.</p>
<p>Întrebări? <a href="/contact">Scrie-ne</a>. Vezi și <a href="/confidentialitate">Politica de confidențialitate</a>.</p>`];

P.siguranta = ['Sfaturi de siguranță', 'Cum eviți fraudele când cumperi sau vinzi pe Omnivo.', `
<h1>Sfaturi de siguranță</h1>
<p>Marea majoritate a tranzacțiilor decurg fără probleme. Câteva reguli simple te feresc de aproape toate fraudele.</p>
<h2>Dacă cumperi</h2>
<ul>
<li><b>Nu plăti în avans</b> unui necunoscut, nici „avans de rezervare”, mai ales dacă prețul pare prea bun.</li>
<li><b>Vezi produsul și testează-l</b> înainte să plătești. Pentru bunuri scumpe, întâlnește-te într-un loc public, ziua.</li>
<li>Verifică <b>profilul vânzătorului</b>: de când e pe platformă, recenziile, alte anunțuri.</li>
<li>Pentru mașini și bunuri cu acte, verifică <b>actele și seria</b> și cere datele reale ale vânzătorului.</li>
<li>Dacă vânzătorul „e plecat” și trimite prin curier cu plata înainte, este un semn de alarmă.</li>
</ul>
<h2>Dacă vinzi</h2>
<ul>
<li><b>Nu da coduri primite prin SMS</b> și nu intra pe linkuri trimise de „cumpărători”. Banii nu se primesc dând un cod sau datele cardului.</li>
<li>Nu există „plată confirmată” care cere să plătești tu o taxă ca să primești banii. Este fraudă.</li>
<li>Predă produsul doar după ce banii sunt în contul tău sau îi ai în mână.</li>
<li>Nu trimite poze cu buletinul sau cu cardul.</li>
</ul>
<h2>Semne de fraudă</h2>
<ul><li>Cineva te mută repede pe WhatsApp, Telegram sau e-mail.</li><li>Ți se cere urgent o plată, un cod sau datele cardului.</li><li>Pretinde că e curier, bancă sau „platformă de plată” și îți trimite un link.</li></ul>
<h2>Ai întâlnit o fraudă?</h2>
<p>Raportează anunțul cu butonul „⚑ Raportează anunțul” din pagina anunțului și <a href="/contact">scrie-ne</a>. Dacă ai pierdut bani, anunță și Poliția sau banca ta cât mai repede.</p>`];

P.ajutor = ['Ajutor și întrebări frecvente', 'Răspunsuri la întrebările des întâlnite despre Omnivo.', `
<h1>Ajutor și întrebări frecvente</h1>
<h2>Cum public un anunț?</h2><p>Apasă „Adaugă”, alege categoria, completează titlul, prețul, descrierea și pozele. Anunțul apare imediat sau după moderare.</p>
<h2>Cât rămâne un anunț publicat?</h2><p>30 de zile. Îl poți reînnoi din Cont › Anunțurile mele cu cel mult 7 zile înainte să expire.</p>
<h2>Cum îmi promovez anunțul?</h2><p>Din Cont › Anunțurile mele, apasă pe „Promovează”. Un anunț promovat apare primul în listă, cu insigna „Promovat”.</p>
<h2>Cum contactez un vânzător?</h2><p>Din pagina anunțului: „Trimite mesaj” sau, dacă vânzătorul a lăsat numărul, „Contact”. Mesajele se văd în Chat.</p>
<h2>Ce sunt planurile Basic, Silver, Gold, Titanium?</h2><p>Sunt niveluri ale contului, cu limite și facilități diferite (anunțuri active, promovări, istoric de statistici). Vezi Cont › Planul meu.</p>
<h2>Ce sunt notificările?</h2><p>Te anunțăm când un anunț salvat la favorite își reduce prețul, când apare un anunț nou care se potrivește cu o căutare salvată și când un anunț al tău a fost verificat.</p>
<h2>Am uitat parola</h2><p>Apasă „Ai uitat parola?” la autentificare și urmează linkul primit pe e-mail.</p>
<h2>Cum îmi șterg contul?</h2><p><a href="/contact">Scrie-ne</a> cu subiectul „Cont” și îl ștergem, împreună cu anunțurile și mesajele tale.</p>
<h2>Nu am găsit răspunsul</h2><p>Scrie-ne prin <a href="/contact">formularul de contact</a>.</p>`];

P.contact = ['Contact', 'Scrie-ne o întrebare sau o problemă.', `
<h1>Contact</h1>
<p>Îți răspundem pe e-mail. Pentru o fraudă sau un anunț problematic, folosește și butonul „⚑ Raportează anunțul” din pagina anunțului.</p>
<form id="contactForm" class="doc-form" novalidate>
  <label for="ctName">Numele tău</label><input id="ctName" autocomplete="name" maxlength="80" required>
  <label for="ctEmail">E-mailul tău</label><input id="ctEmail" type="email" autocomplete="email" maxlength="120" required>
  <label for="ctTopic">Subiect</label>
  <select id="ctTopic"><option value="intrebare">Întrebare</option><option value="cont">Cont</option><option value="anunt">Un anunț</option><option value="frauda">Fraudă</option><option value="sugestie">Sugestie</option><option value="altceva">Altceva</option></select>
  <label for="ctMsg">Mesajul tău</label><textarea id="ctMsg" rows="6" maxlength="3000" required></textarea>
  <input id="ctWeb" class="doc-trap" tabindex="-1" autocomplete="off" aria-hidden="true">
  <label class="check"><input type="checkbox" id="ctOk"><span>Sunt de acord ca datele mele să fie folosite pentru a primi răspuns (<a href="/confidentialitate">detalii</a>)</span></label>
  <p class="err" id="ctErr" hidden></p><p class="ok" id="ctDone" hidden></p>
  <button class="primary" type="submit">Trimite</button>
</form>
<p class="doc-upd">Date de contact: ${who.mail}</p>`, '/doc-ui.js'];

const router = express.Router();
for (const k of Object.keys(P)) {
  const [title, desc, body, script] = P[k];
  const html = layout(title, desc, body, script);
  router.get('/' + k, (req, res) => res.type('html').send(html));
}

/* ---- formularul de contact ---- */
const api = express.Router();
const allow = createThrottle(5, 60 * 60 * 1000);   // 5 mesaje pe oră de la aceeași adresă IP
const TOPICS = ['intrebare', 'cont', 'anunt', 'frauda', 'sugestie', 'altceva'];
api.post('/', ah(async (req, res) => {
  const b = req.body || {};
  if (String(b.website || '').trim()) return res.json({ ok: true });                  // capcană pentru roboți
  if (!allow('c' + clientIp(req))) return res.status(429).json({ error: 'RATE_LIMIT' });
  const name = String(b.name || '').trim().slice(0, 80), email = String(b.email || '').trim().slice(0, 120);
  const message = String(b.message || '').trim().slice(0, 3000), topic = TOPICS.includes(b.topic) ? b.topic : 'altceva';
  if (name.length < 2) return res.status(400).json({ error: 'DATE_INVALIDE', field: 'nume' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'EMAIL_INVALID' });
  if (message.length < 10) return res.status(400).json({ error: 'DATE_INVALIDE', field: 'mesaj' });
  if (b.consent !== true) return res.status(400).json({ error: 'ACORD_NECESAR' });
  if (db.hasDb()) await db.query('INSERT INTO contact_messages(name, email, topic, message, user_id) VALUES($1,$2,$3,$4,$5)', [name, email, topic, message, req.user ? req.user.id : null]);
  const to = config.SUPPORT_EMAIL || config.ADMIN_EMAIL;
  if (to) {
    sendMail(to, `[Omnivo contact] ${topic}: ${name}`, `<p><b>${esc(name)}</b> &lt;${esc(email)}&gt; · ${esc(topic)}</p><p style="white-space:pre-wrap">${esc(message)}</p>`, `${name} <${email}> · ${topic}\n\n${message}`).catch(() => {});
  }
  res.status(201).json({ ok: true });
}));

module.exports = { router, api };
