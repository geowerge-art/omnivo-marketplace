-- „Date generale”: telefoane în plus, locație/livrare, facturare persoană fizică, preferințe. Contact separat pe fiecare anunț.
ALTER TABLE users ADD COLUMN IF NOT EXISTS extra_phones  JSONB NOT NULL DEFAULT '[]';   -- până la 3: [{"phone":"07..","wa":true}]
ALTER TABLE users ADD COLUMN IF NOT EXISTS county        TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS city          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS address       TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bill_name     TEXT;   -- facturare (persoană fizică): nume și prenume
ALTER TABLE users ADD COLUMN IF NOT EXISTS bill_addr     TEXT;   -- adresa de domiciliu
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS iban          TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS menu_pref     TEXT NOT NULL DEFAULT 'seller' CHECK (menu_pref IN ('buyer','seller'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_ok  BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS browser_notif BOOLEAN NOT NULL DEFAULT FALSE;

-- Contactul se poate schimba doar pe un anunț (ex.: postezi pentru altcineva) fără să atingă profilul.
-- contact_show: NULL = ca înainte (telefonul din cont), TRUE = arată contact_phone, FALSE = nu arăta telefonul.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_name  TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_wa    BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS contact_show  BOOLEAN;
