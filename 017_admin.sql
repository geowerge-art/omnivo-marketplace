-- Panou admin: blocări cu motiv și durată, motiv la anunțuri respinse, raportări rezolvate
ALTER TABLE users ADD COLUMN IF NOT EXISTS block_reason TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_until TIMESTAMPTZ;
ALTER TABLE listings ADD COLUMN IF NOT EXISTS mod_note TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS admin_note TEXT;
CREATE INDEX IF NOT EXISTS reports_status_idx ON reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS admin_activity_idx ON admin_activity (id DESC);
