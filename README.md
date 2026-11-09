# Omnivo — marketplace general România

Node.js + Express + PostgreSQL. Backend modular, pornit din piesele generice ale AutoPiese.

## Pornire locală
1. `npm install`
2. Copiază `.env.example` în `.env` și completează `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (minim 12 caractere).
3. `npm start` — la pornire rulează automat migrările și creează contul de administrator.
4. Verifică: `GET /api/health` trebuie să dea `{"ok":true,"db":true}`.
5. Teste: `npm test` (`test/security.test.js` nu are nevoie de bază de date; `test/app.test.js` pornește aplicația fără DB).

Fără `DATABASE_URL` aplicația pornește doar cu pagina statică.

## Structură
- `server.js` — pornire: migrări, administrator, listen, oprire curată
- `src/app.js` — Express: helmet/CSP, compression, CSRF (Origin), rute, 404 JSON pentru `/api/*`
- `src/routes/auth.js` — înregistrare, login (email sau nickname), logout, schimbare/resetare parolă, confirmare email
- `src/routes/categories.js` — arborele de categorii cu atributele fiecăreia
- `src/middleware/` — `loadUser`, `requireAuth`, `requireRole`, `requireVerified`, `ah`, `requireDb`
- `src/lib/` — securitate (parole, tokenuri, limitare), email (Resend)
- `migrations/` — SQL numerotat, rulat o singură dată de `src/migrate.js`
- `public/` — frontend

## Schema
`users`, `sessions`, `password_resets`, `email_verifications`, `login_attempts`, `categories`, `category_attributes`, `listings` (câmpuri comune + `attributes JSONB` specifice categoriei), `listing_images`, `favorites`, `reports`, `admin_activity`.

Atributele specifice (marcă, mărime, kilometri etc.) stau în `category_attributes` și în `listings.attributes`, nu în coloane dedicate.

## API (acum)
| Metodă | Rută | Rol |
|---|---|---|
| GET | `/api/health` | stare server + DB |
| GET | `/api/me` | utilizatorul curent sau `null` |
| POST | `/api/auth/register` `login` `logout` `logout-all` | conturi |
| POST | `/api/auth/change-password` | schimbare parolă (închide celelalte sesiuni) |
| POST | `/api/auth/forgot-password` `reset-password` | resetare parolă |
| POST | `/api/auth/verify-email` `resend-verification` | confirmare email |
| GET | `/api/categories` | categorii + atribute |

## Următorii pași
1. Anunțuri: `POST/GET/PATCH/DELETE /api/listings`, validare după `category_attributes`, moderare.
2. Poze: Supabase Storage + miniaturi WebP (`sharp`).
3. Căutare și filtre (inclusiv pe `attributes`), paginare.
4. Favorite, raportări, panou admin.
5. Mesagerie, rating vânzători.
6. Pagini legale (T&C, confidențialitate, cookie) cu datele reale ale firmei.
