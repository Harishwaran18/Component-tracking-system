'use strict';

const { AppError } = require('../utils/errors');
const logger = require('../utils/logger');
const config = require('../config');

function notFound(req, _res, next) {
  next(AppError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  let statusCode = err.statusCode || 500;
  let code = err.code || 'INTERNAL_ERROR';
  let message = err.message || 'Internal server error';
  let details = err.details;

  if (err.type === 'entity.parse.failed') {
    statusCode = 400;
    code = 'INVALID_JSON';
    message = 'Request body contains invalid JSON';
  } else if (err.type === 'entity.too.large') {
    statusCode = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  }

  if (statusCode >= 500) {
    logger.error({ err, reqId: req.id, path: req.originalUrl, method: req.method }, 'unhandled error');
    if (config.isProd) {
      message = 'Internal server error';
      details = undefined;
    }
  }

  const body = { error: { code, message } };
  if (details) body.error.details = details;
  if (!config.isProd && statusCode >= 500 && err.stack) body.error.stack = err.stack;
  if (req.id) body.error.requestId = req.id;

  res.status(statusCode).json(body);
}

module.exports = { notFound, errorHandler };
