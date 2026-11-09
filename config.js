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
  // promovarea anunțurilor: 'free' = gratuită (cu limite), 'off' = oprită (până adaugi plăți)
  PROMO_MODE: env.PROMO_MODE === 'off' ? 'off' : 'free',
  SESSION_DAYS: 30,
  SESSION_SHORT_HOURS: 12
};
