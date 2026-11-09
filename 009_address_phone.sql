/* Adresă / zonă pe anunț (textul e public; orașul și județul rămân câmpuri separate). */
ALTER TABLE listings ADD COLUMN IF NOT EXISTS address TEXT;
