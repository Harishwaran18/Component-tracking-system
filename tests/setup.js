'use strict';

process.env.NODE_ENV = 'test';
process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production-0123456789';
process.env.JWT_ACCESS_TTL = '15m';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOG_LEVEL = 'silent';
process.env.ADMIN_USERNAME = 'admin';
process.env.ADMIN_EMAIL = 'admin@ece.local';
process.env.ADMIN_PASSWORD = 'Admin@12345';
process.env.ADMIN_NAME = 'System Administrator';
