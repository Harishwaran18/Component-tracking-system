'use strict';

const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const config = require('../config');

const signAccessToken = (user) =>
  jwt.sign(
    { sub: user.id, username: user.username, role: user.role, name: user.full_name },
    config.jwt.secret,
    { expiresIn: config.jwt.accessTtl, issuer: config.jwt.issuer }
  );

const verifyAccessToken = (token) =>
  jwt.verify(token, config.jwt.secret, { issuer: config.jwt.issuer });

const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

module.exports = { signAccessToken, verifyAccessToken, generateRefreshToken, hashToken };
