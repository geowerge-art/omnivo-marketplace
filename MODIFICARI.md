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
