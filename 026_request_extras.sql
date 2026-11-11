-- Cereri: ce fel de piese vrea cumpărătorul (noi / second-hand / oricare), marcaje personale ale ofertanților
-- („mai târziu”, „nu mă interesează”) și ofertă cu piesă nouă.
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'oricare';
ALTER TABLE part_requests DROP CONSTRAINT IF EXISTS part_requests_kind_check;
ALTER TABLE part_requests ADD CONSTRAINT part_requests_kind_check CHECK (kind IN ('oricare','second-hand','noi'));

ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_state_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_state_check CHECK (state IN ('noua','excelenta','buna','uzata','de-reparat'));

CREATE TABLE IF NOT EXISTS request_marks (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id INTEGER NOT NULL REFERENCES part_requests(id) ON DELETE CASCADE,
  mark TEXT NOT NULL CHECK (mark IN ('later','ignored')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, request_id)
);
