'use strict';

const { v4: uuid } = require('uuid');
const { getDb } = require('../db');
const config = require('../config');
const { signAccessToken, generateRefreshToken, hashToken } = require('../utils/token');
const { AppError } = require('../utils/errors');

const refreshExpiry = () => {
  const d = new Date();
  d.setDate(d.getDate() + config.jwt.refreshTtlDays);
  return d.toISOString();
};

function persistRefreshToken(userId, rawToken, req) {
  getDb()
    .prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      uuid(),
      userId,
      hashToken(rawToken),
      refreshExpiry(),
      req?.headers?.['user-agent'] || null,
      req?.ip || null
    );
}

function issueTokens(user, req) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateRefreshToken();
  persistRefreshToken(user.id, refreshToken, req);
  return {
    accessToken,
    refreshToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessTtl,
  };
}

function rotateRefreshToken(rawToken, req) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM refresh_tokens WHERE token_hash = ?').get(hashToken(rawToken));
  if (!row) throw AppError.unauthorized('Invalid refresh token', 'INVALID_REFRESH_TOKEN');
  if (row.revoked_at) throw AppError.unauthorized('Refresh token has been revoked', 'REFRESH_TOKEN_REVOKED');
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    throw AppError.unauthorized('Refresh token expired', 'REFRESH_TOKEN_EXPIRED');
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
  if (!user || !user.is_active) throw AppError.unauthorized('Account is unavailable', 'ACCOUNT_DISABLED');

  const newToken = generateRefreshToken();
  const newId = uuid();
  const tx = db.transaction(() => {
    db.prepare('UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ?').run(
      new Date().toISOString(),
      newId,
      row.id
    );
    db.prepare(
      `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, user_agent, ip)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      newId,
      user.id,
      hashToken(newToken),
      refreshExpiry(),
      req?.headers?.['user-agent'] || null,
      req?.ip || null
    );
  });
  tx();

  return {
    accessToken: signAccessToken(user),
    refreshToken: newToken,
    tokenType: 'Bearer',
    expiresIn: config.jwt.accessTtl,
    user,
  };
}

function revokeRefreshToken(rawToken) {
  if (!rawToken) return;
  getDb()
    .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), hashToken(rawToken));
}

function revokeAllForUser(userId) {
  getDb()
    .prepare('UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL')
    .run(new Date().toISOString(), userId);
}

module.exports = { issueTokens, rotateRefreshToken, revokeRefreshToken, revokeAllForUser };
