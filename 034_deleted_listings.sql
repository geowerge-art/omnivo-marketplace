-- Anunțuri șterse: rămân 30 de zile în „Șterse” (de unde pot fi reactivate), apoi se șterg definitiv automat.
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_at   TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS deleted_from TEXT;   -- statusul de dinainte de ștergere, ca la reactivare să revină la fel
UPDATE listings SET deleted_at = NOW() WHERE status = 'deleted' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS listings_deleted_idx ON listings (deleted_at) WHERE status = 'deleted';
