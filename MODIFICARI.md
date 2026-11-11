# Ce s-a schimbat în această versiune

**Clopoțel în antet:** `index.html`, `icons.js`, `script.js`, `style.css`. Vizibil pentru utilizatorii conectați, cu număr de necitite; deschide Notificările din cont.

**Recenzii în ambele sensuri:** `029_reviews_both_ways.sql`, `profiles.js`, `profile-ui.js`, `requests.js`, `requests-ui.js`, `listings.js`, `account.js`.
- profil: medie separată ca vânzător și ca cumpărător, buton de recenzie pentru fiecare sens, recenziile filtrate pe rol;
- „Cere oferte”: marcare „tranzacție finalizată”, apoi recenzie reciprocă din chatul ofertei; ofertantul vede reputația cumpărătorului după ce a câștigat;
- notificare la fiecare recenzie primită și la finalizare.

**Întrebări la o ofertă:** cumpărătorul întreabă înainte de alegere, ofertantul răspunde (tabela `quote_questions`).

**Pingul pentru Render:** `keepalive.js`, `keepalive.test.js`, `.github/workflows/ping.yml`, linia din `server.js`.

## Verificat și neverificat
- Toate fișierele `.js` trec de `node --check`; `keepalive.test.js` trece.
- Interfața a fost rulată în Chromium cu răspunsuri API simulate (clopoțel pe telefon și calculator, profil, recenzii pe ambele roluri, finalizare, recenzie în chat, întrebări la ofertă): fără erori în aplicație.
- **Nu am putut rula** serverul, testele existente și migrarea 029 pe Postgres (lipsesc pachetele și baza de date aici). Interogările SQL noi sunt scrise cu grijă, dar neprobate: după deploy, `/api/health` trebuie să dea `ok: true`, iar în log trebuie să apară `migrare aplicată: 029_reviews_both_ways.sql`. Dacă migrarea eșuează, aplicația nu pornește; trimite-mi mesajul din log.

## Încă lipsește la „Cere oferte”
- editarea unei cereri după trimitere;
- respingerea unei oferte (fără a o alege pe alta);
- reamintire pentru cumpărător când termenul a trecut și are oferte nealese;
- insignă pentru întrebări / oferte noi în „Cererile mele”.

## Chat: rol și poza produsului
- `messages.js`: `/api/messages` întoarce `seller_id` și `thumb`; `/api/messages/thread` întoarce `listing.thumb`, `listing.seller_id`, `my_role`, `other_role`.
- `script.js`, `index.html`, `style.css`: insignă „Vânzător” / „Cumpărător” lângă numele din antetul chatului și din lista de conversații; poză mică a produsului în bara anunțului și în listă.
- Neverificat pe baza de date reală: interogările SQL noi (subselect pe `listing_images`, ca în `listings.js`).

## Buton „← Înapoi” pe toate ferestrele
- `script.js` (blocul de la final) adaugă un buton „←” în antetul ferestrelor: publicare, căutare, promovare, autentificare, setări, anunț, administrare, profil, recenzie, raportare, date. Apasă butonul de închidere existent, deci comportamentul rămâne același.
- `style.css` (la final): stilul butonului, vizibil la orice lățime de ecran (telefon, laptop, desktop, TV). La ferestrele cu antet complet, ✕ este înlocuit de „←”.
- Chatul și lista de mesaje aveau deja „←”; paginile statice au „← Înapoi la anunțuri”.

## „Cere oferte”: corectare filtru de telefon
- `requests.js`: filtrul care blochează contactul în cereri, oferte și întrebări bloca orice șir de 9+ cifre, deci și coduri OEM (Dacia / Renault 8200123456, Bosch 0 986 494 123, Mercedes A 204 540 12 17). Acum blochează doar mobile românești (07…) și numere internaționale (+40…, 0040…), plus email și linkuri.
- `requests.test.js`: teste noi pentru coduri OEM lungi (trec) și pentru telefoane (refuzate).
- Neverificat: testele nu au putut fi rulate aici (lipsesc pachetele); regexul a fost verificat separat în Node pe 14 exemple.

## „Cere oferte”: email, finalizare sigură, termen de livrare (migrarea 030)
- **Email către cumpărător** când primește oferte (`requests.js`): cel mult unul pe oră per cerere, fără date de contact; plus email către ofertantul câștigător. Funcționează doar dacă `RESEND_API_KEY` și `RESEND_FROM` sunt setate.
- **Finalizare sigură** (`POST /api/requests/quote/:id/complete`): amândoi trebuie să fi scris în chatul ofertei (`CHAT_NECESAR`), iar primul mesaj trebuie să aibă cel puțin o oră (`PREA_DEVREME`); maximum 10 finalizări pe zi per utilizator. Reduce recenziile false făcute cu două conturi.
- **Termen de livrare** la ofertă (`eta_days`: gol = nespecificat, 0 = în stoc, 1–60 zile): câmp în formularul ofertei, afișat cumpărătorului și ofertantului.
- Fișiere: `030_rfq_eta_trust.sql`, `requests.js`, `requests-ui.js`, `requests.test.js`.
- După deploy, în log trebuie să apară `migrare aplicată: 030_rfq_eta_trust.sql`.
- Neverificat: serverul și migrarea pe Postgres nu au putut fi rulate aici. Validările (`parseQuote`, `parseRequest`) au fost testate în Node cu dependențele înlocuite.

## „Cere oferte” v2: câmpuri tehnice, editare, respingere, expediere (migrarea 031)
**Cerere**
- Câmpuri separate: cod piesă (OEM), combustibil, cutie de viteze, caroserie (formular, filtre vizuale, etichete în panou).
- **Editare** (`PUT /api/requests/:id`) cât timp cererea e deschisă; piesa, marca și județul rămân. Ofertanții sunt anunțați (cel mult o dată la 10 minute).
- **VIN** vizibil doar proprietarului, dezmembrătorilor aprobați și celor care au trimis ofertă; ceilalți văd „VIN după ce trimiți o ofertă”.
- Insigne în „Cererile mele”: oferte noi și răspunsuri noi de la ultima vizită.

**Ofertă**
- **Respingere** de către cumpărător (`POST /api/requests/:id/quotes/:qid/reject`); ofertantul e anunțat și nu o mai poate retrimite.
- **Factură** și **mod de plată** acceptat (oricare / ramburs / transfer / numerar).
- **Expediere**: ofertantul câștigător trece curierul și AWB-ul (`POST /api/requests/quote/:qid/ship`); cumpărătorul e anunțat și vede AWB-ul în ofertă și în chat.
- **Preț modificat**: cumpărătorul primește notificare „Ofertă actualizată” (cel mult o dată la 10 minute per ofertă).

**Termene**
- La expirare, ofertele rămase se închid, iar ofertanții și cumpărătorul sunt anunțați. Imediat după termen, cumpărătorul cu oferte nealese primește o reamintire (notificare + email), o singură dată. La anulare, ofertanții sunt anunțați.
- `server.js` rulează verificarea la 10 minute, nu doar la citire.

Fișiere: `031_rfq_v2.sql`, `requests.js`, `requests-ui.js`, `requests.test.js`, `script.js` (iconițe notificări), `style.css`, `server.js`.
După deploy, în log trebuie să apară `migrare aplicată: 031_rfq_v2.sql`.
Neverificat: serverul, migrarea și interogările SQL noi pe Postgres. Validările au fost testate în Node cu dependențele înlocuite.
Încă lipsește: plata online / garantarea banilor, fotografii noi la editarea cererii, notificări push.
