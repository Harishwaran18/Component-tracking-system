'use strict';

const config = require('./config');
const logger = require('./utils/logger');
const { createApp } = require('./app');
const { closeDb } = require('./db');
const { ensureAdmin } = require('./services/bootstrap');

async function main() {
  const app = createApp();
  await ensureAdmin();

  const server = app.listen(config.port, config.host, () => {
    logger.info(
      { port: config.port, host: config.host, env: config.env, version: config.version },
      'ECE Component Tracking System started'
    );
  });

  const shutdown = (signal) => {
    logger.info({ signal }, 'shutting down gracefully');
    server.close(() => {
      closeDb();
      logger.info('shutdown complete');
      process.exit(0);
    });
    setTimeout(() => {
      logger.error('forced shutdown after timeout');
      process.exit(1);
    }, 10000).unref();
  };

  ['SIGINT', 'SIGTERM'].forEach((sig) => process.on(sig, () => shutdown(sig)));

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'unhandled promise rejection');
  });
  process.on('uncaughtException', (err) => {
    logger.error({ err }, 'uncaught exception');
    shutdown('uncaughtException');
  });
}

main().catch((err) => {
  logger.error({ err }, 'failed to start server');
  process.exit(1);
});
