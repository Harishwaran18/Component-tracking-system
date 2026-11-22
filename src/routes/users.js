'use strict';

const express = require('express');
const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { asyncHandler, nowIso, parsePagination, paginated, sanitizeUser, boolToInt } = require('../utils/http');
const { hashPassword } = require('../utils/password');
const { recordAudit } = require('../services/audit');
const { authenticate, authorize } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { createUserSchema, updateUserSchema } = require('../validation/schemas');
const { revokeAllForUser } = require('../services/tokens');

const router = express.Router();
router.use(authenticate, authorize('admin'));

function activeAdminCount() {
  return getDb().prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND is_active = 1").get().c;
}

function getUserOr404(id) {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) throw AppError.notFound('User not found');
  return user;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { page, pageSize, offset } = parsePagination(req.query);
    const { search, role, active } = req.query;
    const where = [];
    const params = [];
    if (search) {
      where.push('(username LIKE ? OR email LIKE ? OR full_name LIKE ?)');
      const q = `%${search}%`;
      params.push(q, q, q);
    }
    if (role) {
      where.push('role = ?');
      params.push(role);
    }
    if (active !== undefined) {
      where.push('is_active = ?');
      params.push(boolToInt(active === 'true' || active === '1'));
    }
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const db = getDb();
    const total = db.prepare(`SELECT COUNT(*) AS c FROM users ${clause}`).get(...params).c;
    const rows = db
      .prepare(`SELECT * FROM users ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset);
    res.json(paginated(rows.map(sanitizeUser), total, { page, pageSize }));
  })
);

router.post(
  '/',
  validate(createUserSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const { username, email, fullName, password, role } = req.body;
    const exists = db
      .prepare('SELECT id FROM users WHERE username = ? OR email = ?')
      .get(username, email);
    if (exists) throw AppError.conflict('A user with this username or email already exists');

    const id = uuid();
    const hash = await hashPassword(password);
    db.prepare(
      `INSERT INTO users (id, username, email, full_name, password_hash, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, username, email, fullName, hash, role, nowIso(), nowIso());

    const created = sanitizeUser(getUserOr404(id));
    recordAudit({ actor: req.user, action: 'user.created', entityType: 'user', entityId: id, after: created, req });
    res.status(201).json({ user: created });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    res.json({ user: sanitizeUser(getUserOr404(req.params.id)) });
  })
);

router.patch(
  '/:id',
  validate(updateUserSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = getUserOr404(req.params.id);
    const { email, fullName, role, isActive, password } = req.body;

    if (user.role === 'admin' && (role && role !== 'admin')) {
      if (activeAdminCount() <= 1 && user.is_active) {
        throw AppError.badRequest('Cannot demote the last active administrator', 'LAST_ADMIN');
      }
    }
    if (user.role === 'admin' && isActive === false && user.is_active) {
      if (activeAdminCount() <= 1) {
        throw AppError.badRequest('Cannot deactivate the last active administrator', 'LAST_ADMIN');
      }
    }

    const updates = [];
    const params = [];
    if (email !== undefined) {
      const clash = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
      if (clash) throw AppError.conflict('Email already in use');
      updates.push('email = ?');
      params.push(email);
    }
    if (fullName !== undefined) {
      updates.push('full_name = ?');
      params.push(fullName);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      params.push(role);
    }
    if (isActive !== undefined) {
      updates.push('is_active = ?');
      params.push(boolToInt(isActive));
    }
    if (password) {
      updates.push('password_hash = ?');
      params.push(await hashPassword(password));
    }
    updates.push('updated_at = ?');
    params.push(nowIso());

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params, user.id);
    if (isActive === false || password) revokeAllForUser(user.id);

    const updated = sanitizeUser(getUserOr404(user.id));
    recordAudit({
      actor: req.user,
      action: 'user.updated',
      entityType: 'user',
      entityId: user.id,
      before: sanitizeUser(user),
      after: updated,
      req,
    });
    res.json({ user: updated });
  })
);

router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = getUserOr404(req.params.id);
    if (user.id === req.user.id) throw AppError.badRequest('You cannot deactivate your own account', 'SELF_DELETE');
    if (user.role === 'admin' && user.is_active && activeAdminCount() <= 1) {
      throw AppError.badRequest('Cannot deactivate the last active administrator', 'LAST_ADMIN');
    }
    db.prepare('UPDATE users SET is_active = 0, updated_at = ? WHERE id = ?').run(nowIso(), user.id);
    revokeAllForUser(user.id);
    recordAudit({ actor: req.user, action: 'user.deactivated', entityType: 'user', entityId: user.id, before: sanitizeUser(user), req });
    res.status(204).send();
  })
);

module.exports = router;
