'use strict';

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const pinoHttp = require('pino-http');
const { v4: uuid } = require('uuid');

const config = require('./config');
const logger = require('./utils/logger');
const { migrate } = require('./db/migrate');
const { getDb } = require('./db');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/error');
const openapi = require('./openapi');

const PUBLIC_DIR = path.resolve(__dirname, '../public');

function corsOptions() {
  if (config.corsOrigin === '*') return { origin: true };
  const allowed = config.corsOrigin.split(',').map((s) => s.trim()).filter(Boolean);
  return {
    origin(origin, cb) {
      if (!origin || allowed.includes(origin)) return cb(null, true);
      return cb(new Error('Origin not allowed by CORS'));
    },
  };
}

function createApp() {
  migrate();

  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors(corsOptions()));
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));

  if (!config.isTest) {
    app.use(
      pinoHttp({
        logger,
        genReqId: (req) => req.headers['x-request-id'] || uuid(),
        customLogLevel: (_req, res, err) => {
          if (err || res.statusCode >= 500) return 'error';
          if (res.statusCode >= 400) return 'warn';
          return 'info';
        },
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url }),
          res: (res) => ({ statusCode: res.statusCode }),
        },
      })
    );
  } else {
    app.use((req, _res, next) => {
      req.id = uuid();
      next();
    });
  }

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'component-tracker',
      version: config.version,
      env: config.env,
      uptime: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/health/ready', (_req, res) => {
    try {
      getDb().prepare('SELECT 1 AS ok').get();
      res.json({ status: 'ready', database: 'ok', timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'not_ready', database: 'error', message: err.message });
    }
  });

  app.get('/api/openapi.json', (_req, res) => res.json(openapi));
  app.get('/api/docs', (_req, res) => res.sendFile(path.join(PUBLIC_DIR, 'docs.html')));

  app.use('/api', apiLimiter);
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/students', require('./routes/students'));
  app.use('/api/components', require('./routes/components'));
  app.use('/api/transactions', require('./routes/transactions'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/audit', require('./routes/audit'));

  app.use(
    express.static(PUBLIC_DIR, {
      maxAge: config.isProd ? '1h' : 0,
      etag: true,
      index: false,
    })
  );

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/health')) return next();
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
