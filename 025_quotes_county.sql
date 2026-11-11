-- Oferte și de la persoane fizice: județul de unde se trimite piesa (la firme se ia din profil dacă lipsește).
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS county TEXT NOT NULL DEFAULT '';
