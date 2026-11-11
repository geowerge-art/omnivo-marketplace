-- GDPR: la ștergerea unui cont se păstrează înregistrările de plată (obligație contabilă), dar fără legătură cu persoana.
DO $$
DECLARE c text;
BEGIN
  FOR c IN SELECT conname FROM pg_constraint WHERE conrelid = 'credit_tx'::regclass AND contype = 'f' AND confrelid = 'users'::regclass LOOP
    EXECUTE format('ALTER TABLE credit_tx DROP CONSTRAINT %I', c);
  END LOOP;
  ALTER TABLE credit_tx ALTER COLUMN user_id DROP NOT NULL;
  ALTER TABLE credit_tx ADD FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
END $$;
