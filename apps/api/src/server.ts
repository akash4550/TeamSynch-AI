import app from './app';
import { logger } from './core/utils/logger';
import { initializeSocket, getIO } from './modules/realtime/socket';
import { RealtimeService } from './modules/realtime/realtime.service';
import { prisma } from './config/prisma';
import { getRedisClient } from './core/redis/redis.client';
import { stopWorkers } from './modules/jobs/workers'; // BUG FIX (#77): graceful worker drain
import { auditSubscriber } from './modules/audit/audit.subscriber'; // QUEUED ITEM #12: audit write coverage
import { Server as HttpServer } from 'node:http';

const PORT = process.env.PORT || 4000;
const SHUTDOWN_TIMEOUT_MS = 15000; // 15-second graceful shutdown safety threshold

let httpServer: HttpServer;

httpServer = app.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);

  // Initialize Socket.io
  initializeSocket(httpServer);
  logger.info('Socket.io initialized');

  // Attach EventBus listeners
  const realtimeService = new RealtimeService();
  realtimeService.initializeListeners();

  // QUEUED ITEM #12: map domain events → ActivityLog rows (was: the audit
  // trail recorded only user role changes; see audit.subscriber.ts).
  auditSubscriber.initializeListeners();
});

let isShuttingDown = false;

async function handleGracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting deterministic graceful shutdown sequence...`);

  // Safety force-exit timer if graceful shutdown hangs
  const forceExitTimeout = setTimeout(() => {
    logger.error(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms. Forcing exit (1).`);
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);

  try {
    // 1. Stop accepting new HTTP requests
    if (httpServer) {
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => {
          if (err) {
            logger.error('Error closing HTTP server:', err);
            return reject(err);
          }
          logger.info('HTTP server closed. No longer accepting new connections.');
          resolve();
        });
      });
    }

    // 2. Drain background workers BEFORE touching Socket.IO / Redis /
    // Prisma (BUG FIX #77 — previously dead stopWorkers, never invoked):
    // worker.close() stops fetching new jobs and lets the CURRENT job of
    // each worker finish — in-flight processors still need Redis (queue
    // state), Prisma (queries) and live sockets (completion events like
    // audit.export.completed) to land cleanly. Bounded by the same 15s
    // force-exit safety net above.
    try {
      await stopWorkers();
      logger.info('Background workers stopped. In-flight jobs drained.');
    } catch (e) {
      logger.warn('Error stopping background workers (continuing shutdown):', e);
    }

    // 3. Disconnect active Socket.IO WebSocket clients
    try {
      const io = getIO();
      await new Promise<void>((resolve) => {
        io.close(() => {
          logger.info('Socket.IO server closed. All WebSocket connections terminated.');
          resolve();
        });
      });
    } catch (e) {
      logger.warn('Socket.IO was not active or failed to close cleanly:', e);
    }

    // 4. Close Redis connection
    try {
      const redis = getRedisClient();
      if (redis.status === 'ready' || redis.status === 'connect') {
        await redis.quit();
        logger.info('Redis connection closed gracefully.');
      }
    } catch (e) {
      logger.warn('Error closing Redis connection:', e);
    }

    // 5. Disconnect Prisma database client
    try {
      await prisma.$disconnect();
      logger.info('Prisma database client disconnected gracefully.');
    } catch (e) {
      logger.error('Error disconnecting Prisma client:', e);
    }

    clearTimeout(forceExitTimeout);
    logger.info('Graceful shutdown completed successfully. Exiting process (0).');
    process.exit(0);
  } catch (error: any) {
    logger.error('Error during graceful shutdown sequence:', error);
    clearTimeout(forceExitTimeout);
    process.exit(1);
  }
}

// Register process signal handlers for Docker & Kubernetes termination signals
process.on('SIGTERM', () => void handleGracefulShutdown('SIGTERM'));
process.on('SIGINT', () => void handleGracefulShutdown('SIGINT'));

// Handle unhandled promise rejections
process.on('unhandledRejection', (err: Error) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`, { stack: err.stack });
  void handleGracefulShutdown('unhandledRejection');
});

// Handle uncaught exceptions
process.on('uncaughtException', (err: Error) => {
  logger.error(`Uncaught Exception: ${err.message}`, { stack: err.stack });
  void handleGracefulShutdown('uncaughtException');
});
