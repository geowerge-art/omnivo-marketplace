-- „Cere oferte”: mai multe piese într-o cerere, preț pe fiecare piesă în ofertă.
-- part_requests.part rămâne (numele pieselor unite), deci cererile vechi și interfața veche merg neschimbate.
CREATE TABLE IF NOT EXISTS request_items (
  id          SERIAL PRIMARY KEY,
  request_id  INTEGER NOT NULL REFERENCES part_requests(id) ON DELETE CASCADE,
  position    SMALLINT NOT NULL DEFAULT 0,
  name        VARCHAR(200) NOT NULL,
  details     VARCHAR(300) NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS request_items_req_idx ON request_items(request_id, position);

CREATE TABLE IF NOT EXISTS quote_items (
  quote_id  INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  item_id   INTEGER NOT NULL REFERENCES request_items(id) ON DELETE CASCADE,
  price     NUMERIC(12,2) NOT NULL CHECK (price > 0),
  state     VARCHAR(12) NOT NULL DEFAULT 'buna',
  PRIMARY KEY (quote_id, item_id)
);

INSERT INTO request_items(request_id, position, name)
SELECT r.id, 0, LEFT(r.part, 200) FROM part_requests r
 WHERE NOT EXISTS (SELECT 1 FROM request_items i WHERE i.request_id = r.id);
INSERT INTO quote_items(quote_id, item_id, price, state)
SELECT q.id, i.id, q.price, q.state FROM quotes q JOIN request_items i ON i.request_id = q.request_id
 WHERE q.price > 0 AND NOT EXISTS (SELECT 1 FROM quote_items x WHERE x.quote_id = q.id);
