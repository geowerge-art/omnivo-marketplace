/* Link propriu pentru fiecare anunț (/anunt/123-titlu), cu etichete pentru partajare (WhatsApp, Facebook) și motoare de căutare,
   plus sitemap.xml și robots.txt. Pagina rămâne aceeași aplicație; serverul doar completează <head>. */
const fs = require('fs');
const path = require('path');
const express = require('express');
const db = require('./db');
const config = require('./config');
const { ah } = require('./common');
const { baseUrl } = require('./mail');

const INDEX = path.join(__dirname, 'index.html');
let tpl = null;
const template = () => tpl || (tpl = fs.readFileSync(INDEX, 'utf8'));
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = (t) => fold(t).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
const abs = (base, u) => (u ? (/^https?:\/\//.test(u) ? u : base + (u.startsWith('/') ? '' : '/') + u) : '');
const PAGES = ['termeni', 'confidentialitate', 'cookies', 'siguranta', 'ajutor', 'contact'];

function withMeta(m) {
  let h = template()
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(m.title)}</title>`)
    .replace(/<meta name="description"[^>]*>/, `<meta name="description" content="${esc(m.description)}">`)
    .replace(/<meta property="og:[^>]*>\s*/g, '');
  const tags = [
    m.canonical ? `<link rel="canonical" href="${esc(m.canonical)}">` : '',
    m.noindex ? '<meta name="robots" content="noindex">' : '',
    '<meta property="og:site_name" content="Omnivo">', '<meta property="og:locale" content="ro_RO">',
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:title" content="${esc(m.title)}">`, `<meta property="og:description" content="${esc(m.description)}">`,
    m.canonical ? `<meta property="og:url" content="${esc(m.canonical)}">` : '',
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
    m.ld ? `<script type="application/ld+json">${JSON.stringify(m.ld).replace(/</g, '\\u003c')}</script>` : ''
  ].filter(Boolean).join('\n  ');
  h = h.replace('</head>', `  ${tags}\n</head>`);
  if (m.noscript) h = h.replace(/<body>/, `<body>\n  <noscript><h1>${esc(m.title)}</h1><p>${esc(m.description)}</p></noscript>`);
  return h;
}

const router = express.Router();

router.get(/^\/anunt\/(\d+)(?:-([^/]*))?\/?$/, ah(async (req, res) => {
  const base = baseUrl(req), id = Number(req.params[0]);
  let l = null;
  if (db.hasDb()) {
    l = (await db.query(
      `SELECT l.id, l.title, l.description, l.price, l.currency, l.condition, l.status, l.county, l.city, l.created_at, l.updated_at, c.name AS category,
              (SELECT url FROM listing_images i WHERE i.listing_id = l.id ORDER BY i.position, i.id LIMIT 1) AS image
         FROM listings l JOIN categories c ON c.id = l.category_id WHERE l.id = $1 AND l.status IN ('approved','sold')`, [id])).rows[0];
  }
  if (!l) return res.status(404).type('html').send(withMeta({ title: 'Anunț indisponibil | Omnivo', description: 'Anunțul căutat nu mai este disponibil.', noindex: true }));
  const canonicalPath = `/anunt/${l.id}${slug(l.title) ? '-' + slug(l.title) : ''}`;
  if (req.path.replace(/\/$/, '') !== canonicalPath) return res.redirect(301, canonicalPath);   // un singur link „oficial” per anunț
  const place = [l.city, l.county].filter(Boolean).join(', ');
  const priceTxt = l.price == null ? 'Preț la cerere' : `${Number(l.price).toLocaleString('ro-RO')} ${l.currency === 'EUR' ? '€' : 'lei'}`;
  const desc = (`${priceTxt}${place ? ' · ' + place : ''}. ${String(l.description || '').replace(/\s+/g, ' ').trim()}`).slice(0, 170);
  const image = abs(base, l.image);
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', name: l.title, description: String(l.description || l.title).slice(0, 500), category: l.category,
    ...(image ? { image: [image] } : {}),
    offers: {
      '@type': 'Offer', url: base + canonicalPath, priceCurrency: l.currency === 'EUR' ? 'EUR' : 'RON', availability: l.status === 'sold' ? 'https://schema.org/SoldOut' : 'https://schema.org/InStock',
      itemCondition: l.condition === 'nou' ? 'https://schema.org/NewCondition' : 'https://schema.org/UsedCondition', ...(l.price != null ? { price: Number(l.price) } : {})
    }
  };
  res.type('html').send(withMeta({ title: `${l.title} | Omnivo`, description: desc, canonical: base + canonicalPath, image, type: 'product', ld, noscript: true }));
}));

/* ---- sitemap.xml (reîmprospătat cel mult o dată pe oră) ---- */
let smCache = { at: 0, xml: '' };
router.get('/sitemap.xml', ah(async (req, res) => {
  const base = baseUrl(req);
  if (Date.now() - smCache.at > 3600 * 1000 || smCache.base !== base) {
    const urls = [{ loc: base + '/' }, ...PAGES.map((p) => ({ loc: `${base}/${p}` }))];
    if (db.hasDb()) {
      const r = await db.query("SELECT id, title, updated_at FROM listings WHERE status = 'approved' AND expires_at > NOW() ORDER BY updated_at DESC LIMIT 5000");
      for (const l of r.rows) urls.push({ loc: `${base}/anunt/${l.id}${slug(l.title) ? '-' + slug(l.title) : ''}`, lastmod: new Date(l.updated_at).toISOString().slice(0, 10) });
    }
    smCache = { at: Date.now(), base, xml: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n` };
  }
  res.type('application/xml').send(smCache.xml);
}));

router.get('/robots.txt', (req, res) => {
  res.type('text/plain').send(`User-agent: *\nDisallow: /api/\nAllow: /\n\nSitemap: ${baseUrl(req)}/sitemap.xml\n`);
});

module.exports = { router, slug, esc };
