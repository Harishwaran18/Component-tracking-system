'use strict';

const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: process.env.ENV_FILE || path.resolve(process.cwd(), '.env') });

const bool = (v, def = false) => (v === undefined ? def : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));
const int = (v, def) => (v === undefined || v === '' ? def : Number.parseInt(v, 10));

const isTest = process.env.NODE_ENV === 'test';

const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest,
  port: int(process.env.PORT, 3000),
  host: process.env.HOST || '0.0.0.0',
  trustProxy: bool(process.env.TRUST_PROXY, true),
  version: require('../../package.json').version,
  jwt: {
    secret: process.env.JWT_SECRET || (isTest ? 'test-secret-do-not-use-in-production-0123456789' : ''),
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: int(process.env.JWT_REFRESH_TTL_DAYS, 7),
    issuer: 'ece-component-tracker',
  },
  bcryptRounds: int(process.env.BCRYPT_ROUNDS, isTest ? 4 : 10),
  dbPath: process.env.DB_PATH || path.resolve(process.cwd(), 'data/components.db'),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  logLevel: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  admin: {
    username: process.env.ADMIN_USERNAME || 'admin',
    email: process.env.ADMIN_EMAIL || 'admin@ece.local',
    password: process.env.ADMIN_PASSWORD || 'Admin@12345',
    name: process.env.ADMIN_NAME || 'System Administrator',
  },
  rateLimit: {
    windowMs: int(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000),
    max: int(process.env.RATE_LIMIT_MAX, 600),
    authMax: int(process.env.RATE_LIMIT_AUTH_MAX, 20),
  },
};

if (!config.jwt.secret && !isTest) {
  throw new Error('JWT_SECRET is required. Copy .env.example to .env and set a strong secret.');
}

if (config.jwt.secret && config.isProd && config.jwt.secret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

module.exports = config;
