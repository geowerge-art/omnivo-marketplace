-- „Cere oferte”: termen de livrare la ofertă + o singură alertă pe email pe oră către cumpărător.
-- eta_days: NULL = nespecificat, 0 = în stoc / expediere imediată, 1..60 = zile până la livrare.
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS eta_days INTEGER;
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_eta_days_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_eta_days_check CHECK (eta_days IS NULL OR eta_days BETWEEN 0 AND 60);

ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS last_quote_mail_at TIMESTAMPTZ;
