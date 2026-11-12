# AGENTS.md — Omnivo marketplace

## Rulare / testare
- Aplicație Node.js + Express + PostgreSQL (nodemon nu e folosit). Start: `npm start` (node server.js). Check: `npm run check`. Teste: `npm test` (node --test).
- Necesită `DATABASE_URL` PostgreSQL extern. Fără el pornește în mod "fără DB" — doar `/api/health` funcționează, restul `/api/*` dau 404.
- Migrările `NNN_*.sql` rulează automat la pornire (o singură dată fiecare). `npm run migrate` = node migrate.js.
- Gândit pentru deploy pe Render (vezi `render.yaml`): variabile `DATABASE_URL`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` (min. 12 caractere), `APP_URL`. Verificare: `/api/health` → ok true.

## Capcane sandbox
- PostgreSQL NU poate rula local: proot nu suportă memorie partajată (`shmget: Function not implemented` la initdb). Folosește o DB externă (Render/Supabase/Neon).
- Git-ul local e instabil în acest sandbox: mutarea fișierelor cu `mv` corupe `.git` (fișierele `.l2s.tmp_*` din `objects/pack` devin "Operation not permitted" și nu se pot șterge/citi). Dacă se strică, reclonează și mută doar `.git` (nu `mv` pe tot conținutul). Codul proiectului rămâne intact.