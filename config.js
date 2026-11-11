const env = process.env;

module.exports = {
  PORT: Number(env.PORT) || 10000,
  IS_PROD: env.NODE_ENV === 'production',
  DATABASE_URL: env.DATABASE_URL || '',
  DATABASE_SSL_STRICT: env.DATABASE_SSL_STRICT === 'true',
  APP_URL: (env.APP_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  ADMIN_EMAIL: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  SUPABASE_URL: (env.SUPABASE_URL || '').replace(/\/+$/, ''),
  SUPABASE_SERVICE_KEY: env.SUPABASE_SERVICE_KEY || '',
  SUPABASE_BUCKET: env.SUPABASE_BUCKET || 'omnivo',
  RESEND_API_KEY: env.RESEND_API_KEY || '',
  RESEND_FROM: env.RESEND_FROM || '',
  REQUIRE_VERIFIED_EMAIL: env.REQUIRE_VERIFIED_EMAIL === 'true',
  // 'approved' = anunțurile apar imediat; 'pending' = intră în moderare (când ai panou de admin în frontend)
  NEW_LISTING_STATUS: env.NEW_LISTING_STATUS === 'pending' ? 'pending' : 'approved',
  // aprobare automată pe scor de încredere (când moderarea e activă, NEW_LISTING_STATUS=pending)
  AUTO_APPROVE_SCORE: env.AUTO_APPROVE === 'off' ? 101 : (Number(env.AUTO_APPROVE_SCORE) > 0 ? Number(env.AUTO_APPROVE_SCORE) : 60),
  AUTO_SPOT_PCT: env.AUTO_SPOT_PCT !== undefined && env.AUTO_SPOT_PCT !== '' && Number.isFinite(Number(env.AUTO_SPOT_PCT)) ? Math.min(100, Math.max(0, Number(env.AUTO_SPOT_PCT))) : 5,
  BLOCKED_WORDS: (env.BLOCKED_WORDS || '').split(',').map((w) => w.trim()).filter(Boolean),
  // promovarea anunțurilor: 'free' = gratuită (cu limite), 'off' = oprită (până adaugi plăți)
  PROMO_MODE: env.PROMO_MODE === 'off' ? 'off' : 'free',
  // facturare: BILLING=on => urcarea, promovarea și planurile se plătesc cu credite (prețurile sunt în pricing.js); altfel rămân gratuite
  BILLING: /^(on|true|1|yes|da)$/i.test((env.BILLING || '').trim()),
  STRIPE_SECRET_KEY: (env.STRIPE_SECRET_KEY || '').trim(),
  STRIPE_WEBHOOK_SECRET: (env.STRIPE_WEBHOOK_SECRET || '').trim(),
  // date afișate în paginile legale și de contact (completează-le în variabilele de mediu)
  SUPPORT_EMAIL: (env.SUPPORT_EMAIL || '').trim(),
  LEGAL_NAME: (env.LEGAL_NAME || '').trim(),
  LEGAL_CUI: (env.LEGAL_CUI || '').trim(),
  LEGAL_ADDRESS: (env.LEGAL_ADDRESS || '').trim(),
  SESSION_DAYS: 30,
  SESSION_SHORT_HOURS: 12
};
