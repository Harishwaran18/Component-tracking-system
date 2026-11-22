'use strict';

const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const config = require('../config');
const { hashPassword } = require('../utils/password');
const { nowIso } = require('../utils/http');
const logger = require('../utils/logger');

async function ensureAdmin() {
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return null;

  const id = uuid();
  const hash = await hashPassword(config.admin.password);
  db.prepare(
    `INSERT INTO users (id, username, email, full_name, password_hash, role, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'admin', ?, ?)`
  ).run(id, config.admin.username, config.admin.email, config.admin.name, hash, nowIso(), nowIso());

  logger.warn(
    { username: config.admin.username },
    'Bootstrap admin created. Change the password immediately after first login.'
  );
  return { id, username: config.admin.username, email: config.admin.email };
}

module.exports = { ensureAdmin };
