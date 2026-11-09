const env = process.env;

module.exports = {
  PORT: Number(env.PORT) || 10000,
  IS_PROD: env.NODE_ENV === 'production',
  DATABASE_URL: env.DATABASE_URL || '',
  DATABASE_SSL_STRICT: env.DATABASE_SSL_STRICT === 'true',
  APP_URL: (env.APP_URL || env.RENDER_EXTERNAL_URL || '').replace(/\/+$/, ''),
  ADMIN_EMAIL: (env.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSWORD: env.ADMIN_PASSWORD || '',
  RESEND_API_KEY: env.RESEND_API_KEY || '',
  RESEND_FROM: env.RESEND_FROM || '',
  REQUIRE_VERIFIED_EMAIL: env.REQUIRE_VERIFIED_EMAIL === 'true',
  SESSION_DAYS: 30,
  SESSION_SHORT_HOURS: 12
};
