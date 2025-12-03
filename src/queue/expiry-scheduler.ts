import { Queue, Worker, Job } from 'bullmq';
import { getRedisConnection } from './redis.js';
import { PaymentService } from '../services/payment.js';

const QUEUE_NAME = 'expiry-check';
const CHECK_INTERVAL_MS = 60 * 1000; // Check every minute

let expiryQueue: Queue | null = null;
let expiryWorker: Worker | null = null;
let schedulerInterval: NodeJS.Timeout | null = null;

/**
 * Get or create the expiry check queue
 */
export function getExpiryQueue(): Queue {
  if (!expiryQueue) {
    const connection = getRedisConnection();
    expiryQueue = new Queue(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });

    console.log('[ExpiryScheduler] Queue initialized');
  }

  return expiryQueue;
}

/**
 * Process expired authorizations
 */
async function processExpiredAuthorizations(job: Job): Promise<{ expiredCount: number }> {
  console.log('[ExpiryScheduler] Checking for expired authorizations');

  const paymentService = new PaymentService();
  const expiredTransactions = await paymentService.getExpiredAuthorizations();

  if (expiredTransactions.length === 0) {
    console.log('[ExpiryScheduler] No expired authorizations found');
    return { expiredCount: 0 };
  }

  console.log(`[ExpiryScheduler] Found ${expiredTransactions.length} expired authorizations`);

  let expiredCount = 0;
  for (const transaction of expiredTransactions) {
    try {
      await paymentService.expireAuthorization(transaction.id);
      expiredCount++;
      console.log(`[ExpiryScheduler] Expired authorization ${transaction.id}`);
    } catch (error) {
      console.error(`[ExpiryScheduler] Failed to expire authorization ${transaction.id}:`, error);
    }
  }

  return { expiredCount };
}

/**
 * Start the expiry check worker
 */
export function startExpiryWorker(): Worker {
  if (!expiryWorker) {
    const connection = getRedisConnection();

    expiryWorker = new Worker(QUEUE_NAME, processExpiredAuthorizations, {
      connection,
      concurrency: 1, // Only one check at a time
    });

    expiryWorker.on('completed', (job, result) => {
      console.log(`[ExpiryScheduler] Check completed: ${result.expiredCount} authorizations expired`);
    });

    expiryWorker.on('failed', (job, error) => {
      console.error('[ExpiryScheduler] Check failed:', error.message);
    });

    expiryWorker.on('error', (error) => {
      console.error('[ExpiryScheduler] Worker error:', error);
    });

    console.log('[ExpiryScheduler] Worker started');
  }

  return expiryWorker;
}

/**
 * Schedule periodic expiry checks
 */
export function startExpiryScheduler(): void {
  if (schedulerInterval) {
    return; // Already running
  }

  const queue = getExpiryQueue();

  // Run immediately on startup
  queue.add('expiry-check', {}, { jobId: `expiry-check-${Date.now()}` });

  // Schedule periodic checks
  schedulerInterval = setInterval(() => {
    queue.add('expiry-check', {}, { jobId: `expiry-check-${Date.now()}` });
  }, CHECK_INTERVAL_MS);

  console.log(`[ExpiryScheduler] Scheduler started (interval: ${CHECK_INTERVAL_MS}ms)`);
}

/**
 * Stop the expiry scheduler and worker
 */
export async function stopExpiryScheduler(): Promise<void> {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[ExpiryScheduler] Scheduler stopped');
  }

  if (expiryWorker) {
    await expiryWorker.close();
    expiryWorker = null;
    console.log('[ExpiryScheduler] Worker stopped');
  }

  if (expiryQueue) {
    await expiryQueue.close();
    expiryQueue = null;
    console.log('[ExpiryScheduler] Queue closed');
  }
}
