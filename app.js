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
const images = require('./images');
const messages = require('./messages');
const live = require('./live');

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
  app.use('/api/messages', messages.router);
  app.use('/api/stream', live.router);
  app.use('/api/favorites', favorites.router);
  app.use('/api/saved-searches', saved.router);

  app.use('/api', (req, res) => res.status(404).json({ error: 'NEGASIT' })); // niciodată index.html pentru /api/*

  // Servim doar fișierele publice, pe listă; restul (server.js etc.) nu poate fi descărcat
  const PUBLIC_FILES = ['index.html', 'style.css', 'script.js', 'icons.js', 'autofill.js', 'cities.js'];
  for (const f of PUBLIC_FILES) app.get('/' + f, (req, res) => res.sendFile(path.join(__dirname, f)));
  app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
