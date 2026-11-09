const db = require('./db');
const config = require('./config');

/* Încapsulează handlere async: erorile ajung la middleware-ul de erori. */
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requireDb = (req, res, next) => (db.hasDb() ? next() : res.status(503).json({ error: 'NO_DB' }));

/* Protecție CSRF simplă: la cereri care modifică date, dacă browserul trimite Origin, trebuie să fie același host. */
function originCheck(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (!origin) return next();
  try {
    const o = new URL(origin);
    const allowed = config.APP_URL ? new URL(config.APP_URL).host : req.get('host');
    if (o.host === allowed || o.host === req.get('host')) return next();
  } catch { /* cade în refuz */ }
  return res.status(403).json({ error: 'BAD_ORIGIN' });
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON_INVALID' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ error: 'PREA_MARE' });
  console.error(err);
  if (res.headersSent) return;
  res.status(500).json({ error: 'SERVER_ERROR' });
}

module.exports = { ah, requireDb, originCheck, errorHandler };
