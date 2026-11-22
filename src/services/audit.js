'use strict';

const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { nowIso } = require('../utils/http');

function recordAudit({ actor, action, entityType, entityId = null, before = null, after = null, req = null }) {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_logs
          (id, actor_id, actor_username, action, entity_type, entity_id, before_json, after_json, ip, user_agent, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        uuid(),
        actor?.id || null,
        actor?.username || null,
        action,
        entityType,
        entityId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        req?.ip || null,
        req?.headers?.['user-agent'] || null,
        nowIso()
      );
  } catch (err) {
    // Auditing must never break the primary operation.
    // eslint-disable-next-line no-console
    console.error('audit write failed', err.message);
  }
}

module.exports = { recordAudit };
