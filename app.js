const express = require('express');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const config = require('./config');
const db = require('./db');
const { ah, originCheck, errorHandler } = require('./common');
const { loadUser } = require('./authmw');
const auth = require('./auth');
const categories = require('./categories');
const favorites = require('./favorites');
const saved = require('./saved');
const listings = require('./listings');
const admin = require('./admin');
const images = require('./images');
const messages = require('./messages');
const live = require('./live');
const plans = require('./plans');
const studio = require('./studio');
const notify = require('./notify');
const seo = require('./seo');
const pages = require('./pages');
const profiles = require('./profiles');
const billing = require('./billing');
const account = require('./account');
const requests = require('./requests');

function createApp() {
  const app = express();
  app.set('trust proxy', 1); // Render e în spatele unui proxy: necesar pentru IP-ul real și cookie secure
  app.disable('x-powered-by');

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.IS_PROD ? { upgradeInsecureRequests: [] } : {})
      }
    }
  }));
  app.use(compression());
  app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '200kb' }), (req, res, next) => billing.webhook(req, res).catch(next));   // înainte de express.json: semnătura se verifică pe corpul brut
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(originCheck);
  app.use('/api', loadUser);

  app.get('/api/health', ah(async (req, res) => {
    let dbOk = null;
    if (db.hasDb()) { try { await db.query('SELECT 1'); dbOk = true; } catch { dbOk = false; } }
    res.status(dbOk === false ? 503 : 200).json({ ok: dbOk !== false, db: dbOk });
  }));
  app.get('/api/status', (req, res) => res.json({ name: 'Omnivo', status: 'online' }));
  app.get('/api/me', (req, res) => res.json({ user: req.user ? auth.publicUser(req.user) : null }));

  app.use('/api/auth', auth.router);
  app.use('/api/categories', categories.router);
  app.use('/api/listings', images.router);
  app.use('/api/images', images.publicRouter);
  app.use('/api/listings', listings.router);
  app.use('/api/admin/listings', listings.adminRouter);
  app.use('/api/admin', admin.router);
  app.use('/api/reports', admin.publicRouter);
  app.use('/api/messages', messages.router);
  app.use('/api/stream', live.router);
  app.use('/api/plans', plans.router);
  app.use('/api/studio', studio.router);
  app.use('/api/notifications', notify.router);
  app.use('/api/contact', pages.api);
  app.use('/api/users', profiles.router);
  app.use('/api/billing', billing.router);
  app.use('/api/account', account.router);
  app.use('/api/requests', requests.router);
  app.use('/api/favorites', favorites.router);
  app.use('/api/saved-searches', saved.router);

  app.use('/api', (req, res) => res.status(404).json({ error: 'NEGASIT' })); // niciodată index.html pentru /api/*

  // Servim doar fișierele publice, pe listă; restul (server.js etc.) nu poate fi descărcat
  const PUBLIC_FILES = ['index.html', 'style.css', 'script.js', 'icons.js', 'autofill.js', 'cities.js', 'admin-ui.js', 'profile-ui.js', 'billing-ui.js', 'studio-ui.js', 'doc-ui.js', 'privacy-ui.js', 'requests-ui.js'];
  for (const f of PUBLIC_FILES) app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f)));
  app.use(seo.router);     // /anunt/ID-titlu, sitemap.xml, robots.txt
  app.use(pages.router);   // /termeni, /confidentialitate, /cookies, /siguranta, /ajutor, /contact
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
