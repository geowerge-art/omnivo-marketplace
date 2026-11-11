-- „Cere oferte” v2: câmpuri tehnice la cerere, respingerea ofertelor, factură / plată / AWB la ofertă,
-- „văzut” pentru cumpărător (insigne cu oferte noi) și reamintire după termen.

-- cerere: cod OEM, combustibil, cutie, caroserie (separate de „detalii”) + editare + reamintire
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS oem TEXT NOT NULL DEFAULT '';
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS fuel TEXT NOT NULL DEFAULT '';
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS gearbox TEXT NOT NULL DEFAULT '';
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS body_type TEXT NOT NULL DEFAULT '';
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ;
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS reminded_at TIMESTAMPTZ;
ALTER TABLE part_requests ADD COLUMN IF NOT EXISTS buyer_seen_at TIMESTAMPTZ;
ALTER TABLE part_requests DROP CONSTRAINT IF EXISTS part_requests_fuel_check;
ALTER TABLE part_requests ADD CONSTRAINT part_requests_fuel_check CHECK (fuel IN ('','benzina','motorina','gpl','hibrid','electric'));
ALTER TABLE part_requests DROP CONSTRAINT IF EXISTS part_requests_gearbox_check;
ALTER TABLE part_requests ADD CONSTRAINT part_requests_gearbox_check CHECK (gearbox IN ('','manuala','automata'));
ALTER TABLE part_requests DROP CONSTRAINT IF EXISTS part_requests_body_type_check;
ALTER TABLE part_requests ADD CONSTRAINT part_requests_body_type_check CHECK (body_type IN ('','berlina','break','hatchback','suv','monovolum','coupe','cabrio','utilitara'));

-- oferta: respinsă de cumpărător, factură, mod de plată, expediere (AWB)
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_status_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_status_check CHECK (status IN ('sent','won','lost','withdrawn','rejected'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS invoice BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS payment TEXT NOT NULL DEFAULT 'oricare';
ALTER TABLE quotes DROP CONSTRAINT IF EXISTS quotes_payment_check;
ALTER TABLE quotes ADD CONSTRAINT quotes_payment_check CHECK (payment IN ('oricare','ramburs','transfer','numerar'));
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS carrier TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS awb TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
