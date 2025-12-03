import app from './app.js';
import { config } from './config/index.js';
import { startWebhookWorker, stopWebhookWorker } from './queue/webhook-queue.js';
import {
  startExpiryWorker,
  startExpiryScheduler,
  stopExpiryScheduler,
} from './queue/expiry-scheduler.js';
import { closeRedisConnection } from './queue/redis.js';

// Start workers
startWebhookWorker();
startExpiryWorker();
startExpiryScheduler();

const server = app.listen(config.port, () => {
  console.log(`NSIM Payment Network running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Workers: webhook, expiry-scheduler`);
});

// Graceful shutdown
async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down gracefully`);

  // Stop accepting new connections
  server.close(async () => {
    console.log('HTTP server closed');

    // Stop workers and close Redis
    try {
      await stopWebhookWorker();
      await stopExpiryScheduler();
      await closeRedisConnection();
      console.log('All connections closed');
    } catch (error) {
      console.error('Error during shutdown:', error);
    }

    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
