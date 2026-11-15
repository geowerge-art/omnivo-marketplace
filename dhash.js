/* Amprenta unei poze (dHash): poza se face gri 9×8, iar fiecare pixel e comparat cu vecinul din dreapta => 64 de biți.
   Aceeași poză redimensionată, comprimată sau cu altă lumină păstrează aproape aceeași amprentă, deci diferă puțini biți. */
const MAX_DIST = 4;   // diferență (din 64 de biți) până la care două poze sunt considerate aceeași poză

/* gray: 72 de octeți (9 coloane × 8 rânduri) */
function hashFromGray(gray) {
  if (!gray || gray.length < 72) return null;
  let h = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) h = (h << 1n) | (gray[y * 9 + x] > gray[y * 9 + x + 1] ? 1n : 0n);
  return h.toString(16).padStart(16, '0');
}
async function dhash(sharp, buf) {
  if (!sharp) return null;
  try {
    const { data } = await sharp(buf, { limitInputPixels: 40e6 }).rotate().removeAlpha().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    return data.length === 72 ? hashFromGray(data) : null;   // exact 9×8×1 canal; altfel nu riscăm o amprentă greșită
  } catch { return null; }
}
const bits = (hex) => { let n = BigInt('0x' + hex), c = 0; while (n) { c += Number(n & 1n); n >>= 1n; } return c; };
const distance = (a, b) => bits((BigInt('0x' + a) ^ BigInt('0x' + b)).toString(16));
/* poze aproape uniforme (negru, alb, cer) dau amprente aproape identice: nu le comparăm */
const usable = (h) => /^[0-9a-f]{16}$/.test(h || '') && bits(h) >= 8 && bits(h) <= 56;
/* rows: [{ phash, ... }]; întoarce cea mai apropiată sub prag, sau null */
function nearest(hash, rows, max = MAX_DIST) {
  if (!usable(hash)) return null;
  let best = null;
  for (const r of rows) { if (!usable(r.phash)) continue; const d = distance(hash, r.phash); if (d <= max && (!best || d < best.dist)) best = { ...r, dist: d }; }
  return best;
}

module.exports = { hashFromGray, dhash, distance, usable, nearest, MAX_DIST };
