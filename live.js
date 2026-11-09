/* Timp real prin Server-Sent Events: mesaje noi, bife (livrat / citit), online / offline, „scrie…".
   O conexiune per tab, doar pentru utilizatorii autentificați. Heartbeat la 25 s ca proxy-urile să nu o închidă. */
const express = require('express');
const db = require('./db');
const { requireDb } = require('./common');
const { requireAuth } = require('./authmw');

const clients = new Map();        // userId -> Set<res>
const offlineTimers = new Map();

function send(userId, event, data) {
  const set = clients.get(Number(userId));
  if (!set || !set.size) return 0;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  let n = 0;
  for (const res of set) { try { res.write(payload); n++; } catch { set.delete(res); } }
  return n;
}
const isOnline = (uid) => !!(clients.get(Number(uid)) && clients.get(Number(uid)).size);

/* când cineva intră / iese, persoanele cu care a vorbit primesc imediat „online / offline" (dacă nu și-a ascuns prezența) */
async function broadcastPresence(uid, online) {
  try {
    const u = (await db.query('SELECT show_presence FROM users WHERE id = $1', [uid])).rows[0];
    if (!u || u.show_presence === false) return;
    const c = await db.query('SELECT DISTINCT CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS o FROM messages WHERE sender_id = $1 OR recipient_id = $1 LIMIT 500', [uid]);
    for (const r of c.rows) send(r.o, 'presence', { uid, online });
  } catch { /* prezența nu e critică */ }
}

/* mesajele primite cât erai offline devin „livrate" (două bife gri) când te conectezi */
async function markDelivered(uid) {
  const r = await db.query('UPDATE messages SET delivered_at = NOW() WHERE recipient_id = $1 AND delivered_at IS NULL RETURNING id, sender_id', [uid]);
  const by = new Map();
  for (const m of r.rows) { if (!by.has(m.sender_id)) by.set(m.sender_id, []); by.get(m.sender_id).push(m.id); }
  for (const [sid, ids] of by) send(sid, 'msg_status', { with: uid, ids, status: 'delivered' });
  await db.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [uid]);
}

async function presenceOf(uid) {
  const u = (await db.query('SELECT show_presence, last_seen FROM users WHERE id = $1', [uid])).rows[0];
  if (!u || u.show_presence === false) return { hidden: true };
  return { hidden: false, online: isOnline(uid), last_seen: u.last_seen };
}

const router = express.Router();
router.get('/', requireDb, requireAuth, (req, res) => {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',   // no-transform: compression nu buferează fluxul
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders?.();
  const uid = req.user.id;
  if (!clients.has(uid)) clients.set(uid, new Set());
  const wasOffline = !clients.get(uid).size;
  clients.get(uid).add(res);
  clearTimeout(offlineTimers.get(uid)); offlineTimers.delete(uid);
  if (wasOffline) broadcastPresence(uid, true);
  res.write('event: ready\ndata: {"ok":true}\n\n');
  markDelivered(uid).catch(() => {});
  const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { cleanup(); } }, 25000);
  const cleanup = () => {
    clearInterval(hb);
    const set = clients.get(uid);
    if (!set) return;
    set.delete(res);
    if (set.size) return;
    clients.delete(uid);
    db.query('UPDATE users SET last_seen = NOW() WHERE id = $1', [uid]).catch(() => {});
    // 2 secunde de grație: o reîncărcare a paginii nu te face „offline" pentru o clipă
    clearTimeout(offlineTimers.get(uid));
    offlineTimers.set(uid, setTimeout(() => { offlineTimers.delete(uid); if (!clients.has(uid)) broadcastPresence(uid, false); }, 2000));
  };
  req.on('close', cleanup);
  req.on('error', cleanup);
});

module.exports = { router, send, isOnline, presenceOf };
