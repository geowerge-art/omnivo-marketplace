/* Ștergerea completă a unui cont. Folosită de „Șterge-mi contul” (utilizatorul) și de panoul de administrare.
   Șterge și anunțurile (altfel rămâneau publice, fără proprietar) și pozele lor din Storage.
   Plățile (credit_tx) rămân anonimizate, pentru contabilitate (vezi 022_privacy.sql). */
const db = require('./db');

async function eraseUser(uid) {
  const c = await db.pool.connect();
  let urls = [], listings = 0;
  try {
    await c.query('BEGIN');
    const im = await c.query('SELECT i.url, i.thumb_url FROM listing_images i JOIN listings l ON l.id = i.listing_id WHERE l.user_id = $1', [uid]);
    urls = im.rows.flatMap((r) => [r.url, r.thumb_url]).filter(Boolean);
    listings = (await c.query('DELETE FROM listings WHERE user_id = $1', [uid])).rowCount;
    await c.query('DELETE FROM contact_messages WHERE user_id = $1', [uid]);
    await c.query('DELETE FROM users WHERE id = $1', [uid]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK').catch(() => {}); throw e; } finally { c.release(); }
  try { await require('./images').removeStored(...urls); } catch (e) { console.error('erase: poze rămase în Storage:', e.message); }
  return { listings, images: urls.length };
}

module.exports = { eraseUser };
