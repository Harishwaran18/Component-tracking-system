'use strict';

const express = require('express');
const { getDb } = require('../db');
const { asyncHandler, parsePagination, paginated } = require('../utils/http');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate, authorize('admin'));

const parseJson = (v) => {
  if (!v) return null;
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
};

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { action, entityType, entityId, actorId, search, from, to } = req.query;
    const where = [];
    const params = [];
    if (action) {
      where.push('action = ?');
      params.push(action);
    }
    if (entityType) {
      where.push('entity_type = ?');
      params.push(entityType);
    }
    if (entityId) {
      where.push('entity_id = ?');
      params.push(entityId);
    }
    if (actorId) {
      where.push('actor_id = ?');
      params.push(actorId);
    }
    if (search) {
      where.push('(actor_username LIKE ? OR action LIKE ? OR entity_type LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (from) {
      where.push('created_at >= ?');
      params.push(from);
    }
    if (to) {
      where.push('created_at <= ?');
      params.push(to);
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${clause}`).get(...params).c;
    const rows = db
      .prepare(`SELECT * FROM audit_logs ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);

    const data = rows.map((r) => ({
      ...r,
      before: parseJson(r.before_json),
      after: parseJson(r.after_json),
      before_json: undefined,
      after_json: undefined,
    }));
    res.json(paginated(data, total, { page, pageSize }));
  })
);

router.get(
  '/actions',
  asyncHandler(async (_req, res) => {
    const rows = getDb()
      .prepare('SELECT action, COUNT(*) AS count FROM audit_logs GROUP BY action ORDER BY action')
      .all();
    res.json({ actions: rows });
  })
);

module.exports = router;
