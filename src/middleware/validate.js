'use strict';

const { ZodError } = require('zod');
const { AppError } = require('../utils/errors');

const validate = (schema, source = 'body') => (req, _res, next) => {
  try {
    const parsed = schema.parse(req[source]);
    if (source === 'query' || source === 'params') {
      Object.defineProperty(req, source, { value: parsed, writable: true, configurable: true });
    } else {
      req[source] = parsed;
    }
    next();
  } catch (err) {
    if (err instanceof ZodError) {
      const details = err.issues.map((i) => ({
        path: i.path.join('.') || source,
        message: i.message,
        code: i.code,
      }));
      return next(AppError.unprocessable('Validation failed', details));
    }
    next(err);
  }
};

module.exports = { validate };
