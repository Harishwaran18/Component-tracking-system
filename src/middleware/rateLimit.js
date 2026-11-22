'use strict';

const rateLimit = require('express-rate-limit');
const config = require('../config');

const base = {
  windowMs: config.rateLimit.windowMs,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
  skip: () => config.isTest,
};

const apiLimiter = rateLimit({ ...base, max: config.rateLimit.max });
const authLimiter = rateLimit({
  ...base,
  max: config.rateLimit.authMax,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts, try again later.' } },
});

module.exports = { apiLimiter, authLimiter };
