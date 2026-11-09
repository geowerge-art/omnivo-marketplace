# Omnivo

Node.js + Express + PostgreSQL. Toate fișierele sunt în același folder (fără subfoldere).

Variabile Render: DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD (minim 12 caractere), APP_URL.
Opțional: RESEND_API_KEY, RESEND_FROM, REQUIRE_VERIFIED_EMAIL.

Verificare după deploy: /api/health trebuie să dea ok true.
Migrările (001_init.sql, 002_seed_categories.sql) rulează automat la pornire.
