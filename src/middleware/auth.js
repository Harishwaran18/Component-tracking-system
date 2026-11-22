'use strict';

const { getDb } = require('../db');
const { verifyAccessToken } = require('../utils/token');
const { AppError } = require('../utils/errors');

function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return next(AppError.unauthorized('Missing or malformed Authorization header'));
  }
  try {
    const payload = verifyAccessToken(token);
    const user = getDb()
      .prepare('SELECT id, username, email, full_name, role, is_active FROM users WHERE id = ?')
      .get(payload.sub);
    if (!user) return next(AppError.unauthorized('Account no longer exists'));
    if (!user.is_active) return next(AppError.forbidden('Account is disabled', 'ACCOUNT_DISABLED'));
    req.user = { ...user, is_active: Boolean(user.is_active) };
    next();
  } catch (err) {
    const message = err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';
    next(AppError.unauthorized(message, err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN'));
  }
}

const authorize = (...roles) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(AppError.forbidden(`Requires role: ${roles.join(' or ')}`));
  }
  next();
};

module.exports = { authenticate, authorize };
