'use strict';

const express = require('express');
const { getDb } = require('../db');
const { AppError } = require('../utils/errors');
const { asyncHandler, nowIso, sanitizeUser } = require('../utils/http');
const { verifyPassword, hashPassword } = require('../utils/password');
const { issueTokens, rotateRefreshToken, revokeRefreshToken, revokeAllForUser } = require('../services/tokens');
const { recordAudit } = require('../services/audit');
const { authenticate } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimit');
const { loginSchema, refreshSchema, changePasswordSchema } = require('../validation/schemas');

const router = express.Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { username, password } = req.body;
    const db = getDb();
    const user = db
      .prepare('SELECT * FROM users WHERE username = ? OR email = ?')
      .get(username, username);

    if (!user) {
      recordAudit({ action: 'auth.login.failed', entityType: 'user', req, after: { username } });
      throw AppError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    if (user.locked_until && new Date(user.locked_until).getTime() > Date.now()) {
      throw new AppError(423, 'Account temporarily locked due to repeated failed logins', 'ACCOUNT_LOCKED');
    }

    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      const attempts = user.failed_attempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS
          ? new Date(Date.now() + LOCK_MINUTES * 60 * 1000).toISOString()
          : null;
      db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?').run(
        attempts,
        lockedUntil,
        nowIso(),
        user.id
      );
      recordAudit({ action: 'auth.login.failed', entityType: 'user', entityId: user.id, req, after: { attempts } });
      throw AppError.unauthorized('Invalid username or password', 'INVALID_CREDENTIALS');
    }

    if (!user.is_active) throw AppError.forbidden('Account is disabled', 'ACCOUNT_DISABLED');

    db.prepare(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login_at = ?, updated_at = ? WHERE id = ?'
    ).run(nowIso(), nowIso(), user.id);

    const tokens = issueTokens(user, req);
    recordAudit({ actor: user, action: 'auth.login.success', entityType: 'user', entityId: user.id, req });
    res.json({ ...tokens, user: sanitizeUser(user) });
  })
);

router.post(
  '/refresh',
  validate(refreshSchema),
  asyncHandler(async (req, res) => {
    const result = rotateRefreshToken(req.body.refreshToken, req);
    res.json({ ...result, user: sanitizeUser(result.user) });
  })
);

router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    revokeRefreshToken(req.body?.refreshToken);
    res.status(204).send();
  })
);

router.get('/me', authenticate, (req, res) => {
  const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({ user: sanitizeUser(user) });
});

router.post(
  '/change-password',
  authenticate,
  validate(changePasswordSchema),
  asyncHandler(async (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const ok = await verifyPassword(req.body.currentPassword, user.password_hash);
    if (!ok) throw AppError.unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');

    const newHash = await hashPassword(req.body.newPassword);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(newHash, nowIso(), user.id);
    revokeAllForUser(user.id);
    recordAudit({ actor: req.user, action: 'auth.password.changed', entityType: 'user', entityId: user.id, req });
    res.json({ message: 'Password updated. Please sign in again.' });
  })
);

module.exports = router;
