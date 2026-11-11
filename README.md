# Omnivo

Node.js + Express + PostgreSQL. Toate fișierele sunt în același folder (fără subfoldere).

Variabile Render: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD (minim 12 caractere), APP_URL.
Opțional: RESEND_API_KEY, RESEND_FROM, REQUIRE_VERIFIED_EMAIL.

Verificare după deploy: /api/health trebuie să dea ok true.
Migrările (fișierele `NNN_*.sql`, inclusiv `006_messages.sql`) rulează automat la pornire, o singură dată fiecare.

## Mesagerie și editare
- `messages.js`: conversații cumpărător–vânzător legate de un anunț. Cumpărătorul scrie vânzătorului; vânzătorul poate doar să răspundă cuiva care i-a scris. Limită 60 mesaje/oră, 2000 de caractere, blocare de utilizatori (`user_blocks`).
- `PATCH /api/listings/:id`: editarea conținutului de către proprietar. Un anunț respins revine la moderare; unul publicat revine la moderare doar dacă `NEW_LISTING_STATUS=pending`.
- Interfața reîmprospătează conversația deschisă la 8 secunde și insigna de necitite la 30 de secunde (fără WebSocket/SSE).

## Înregistrare
Se acceptă orice adresă de forma `ceva@ceva` (fără spații); nu se verifică existența ei. Contul funcționează imediat. `REQUIRE_VERIFIED_EMAIL=true` cere confirmare doar dacă emailul e configurat (`RESEND_API_KEY` + `RESEND_FROM`); altfel e ignorat.

## Recenzii în ambele sensuri (migrarea 029)
- Profilul arată separat media **ca vânzător** și **ca cumpărător**. Tabela `reviews` are acum `role` (`seller` / `buyer`): `seller_id` rămâne utilizatorul recenzat, `role` spune în ce rol.
- **Anunțuri:** cumpărătorul îl recenzează pe vânzător după ce i-a scris pe un anunț; vânzătorul îl recenzează pe cumpărător după ce acesta i-a scris pe un anunț al lui și el a răspuns. Una per (cine recenzează, cine e recenzat, anunț).
- **Cere oferte:** după alegerea ofertei, oricare dintre cei doi apasă „Marchează tranzacția ca finalizată” (`POST /api/requests/quote/:id/complete`); apoi fiecare lasă o recenzie celuilalt (`PUT /api/requests/quote/:id/rating`, modificabilă). Ofertantul vede reputația cumpărătorului abia după ce a câștigat oferta.
- **Întrebări la o ofertă** (înainte de alegere): cumpărătorul întreabă (max. 5 pe ofertă, fără telefon / email / linkuri), ofertantul răspunde; ambii primesc notificare.

## Clopoțelul de notificări
Apare în antet (pe telefon și pe calculator) pentru utilizatorii conectați, cu numărul de notificări necitite. Apăsat, deschide Notificările din cont. Se actualizează în timp real (SSE). Dacă îl vrei vizibil doar când există notificări necitite, în `paintBell()` din `script.js` pune `b.hidden = !me || !notifCount`.

## Să nu adoarmă (Render, plan gratuit)
`keepalive.js` face singur un ping la `/api/health` din 10 în 10 minute, în producție, pe `APP_URL` (sau `RENDER_EXTERNAL_URL`). Se oprește cu `KEEPALIVE=off`.
`.github/workflows/ping.yml` face același lucru din GitHub Actions (variabila de repo `PING_URL` = `https://ADRESA-TA.onrender.com/api/health`) și îl trezește și după un restart.
