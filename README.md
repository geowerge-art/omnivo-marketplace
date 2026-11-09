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
