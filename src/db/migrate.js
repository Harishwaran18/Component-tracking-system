'use strict';

const fs = require('fs');
const path = require('path');
const { getDb } = require('./index');
const logger = require('../utils/logger');

const SCHEMA_VERSION = '1.0.0';
const SCHEMA_PATH = path.resolve(__dirname, '../../schema.sql');

function migrate(database = getDb()) {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  database.exec(schema);
  database
    .prepare('INSERT OR IGNORE INTO schema_migrations (version) VALUES (?)')
    .run(SCHEMA_VERSION);
  logger.debug({ version: SCHEMA_VERSION }, 'schema ensured');
}

if (require.main === module) {
  migrate();
  logger.info('migration complete');
}

module.exports = { migrate, SCHEMA_VERSION };
