import { Queue, Worker, Job } from 'bullmq';
import crypto from 'crypto';
import { getRedisConnection } from './redis.js';
import { config } from '../config/index.js';
import { WebhookJobData, WebhookDeliveryResult } from '../types/webhook.js';

const QUEUE_NAME = 'webhooks';

let webhookQueue: Queue<WebhookJobData> | null = null;
let webhookWorker: Worker<WebhookJobData, WebhookDeliveryResult> | null = null;

/**
 * Get or create the webhook queue
 */
export function getWebhookQueue(): Queue<WebhookJobData> {
  if (!webhookQueue) {
    const connection = getRedisConnection();
    webhookQueue = new Queue<WebhookJobData>(QUEUE_NAME, {
      connection,
      defaultJobOptions: {
        attempts: config.webhook.maxRetries,
        backoff: {
          type: 'exponential',
          delay: config.webhook.retryDelayMs,
        },
        removeOnComplete: 100, // Keep last 100 completed jobs
        removeOnFail: 1000, // Keep last 1000 failed jobs
      },
    });

    console.log('[WebhookQueue] Queue initialized');
  }

  return webhookQueue;
}

/**
 * Generate HMAC signature for webhook payload
 */
function generateSignature(payload: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Deliver webhook to merchant
 */
async function deliverWebhook(job: Job<WebhookJobData>): Promise<WebhookDeliveryResult> {
  const { webhookUrl, webhookSecret, payload, attempt } = job.data;

  console.log(`[WebhookWorker] Delivering webhook ${payload.id} to ${webhookUrl} (attempt ${attempt + 1})`);

  const payloadString = JSON.stringify(payload);
  const signature = generateSignature(payloadString, webhookSecret);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.webhook.timeoutMs);

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Signature': `sha256=${signature}`,
        'X-Webhook-Id': payload.id,
        'X-Webhook-Timestamp': payload.timestamp,
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      console.log(`[WebhookWorker] Webhook ${payload.id} delivered successfully (${response.status})`);
      return {
        success: true,
        statusCode: response.status,
        deliveredAt: new Date(),
      };
    }

    // Non-2xx response
    const error = `HTTP ${response.status}: ${response.statusText}`;
    console.warn(`[WebhookWorker] Webhook ${payload.id} failed: ${error}`);
    throw new Error(error);
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout after ${config.webhook.timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Start the webhook worker
 */
export function startWebhookWorker(): Worker<WebhookJobData, WebhookDeliveryResult> {
  if (!webhookWorker) {
    const connection = getRedisConnection();

    webhookWorker = new Worker<WebhookJobData, WebhookDeliveryResult>(
      QUEUE_NAME,
      deliverWebhook,
      {
        connection,
        concurrency: 5, // Process 5 webhooks concurrently
      }
    );

    webhookWorker.on('completed', (job, result) => {
      console.log(`[WebhookWorker] Job ${job.id} completed:`, result);
    });

    webhookWorker.on('failed', (job, error) => {
      console.error(`[WebhookWorker] Job ${job?.id} failed:`, error.message);
    });

    webhookWorker.on('error', (error) => {
      console.error('[WebhookWorker] Worker error:', error);
    });

    console.log('[WebhookWorker] Worker started');
  }

  return webhookWorker;
}

/**
 * Stop the webhook worker and close queue
 */
export async function stopWebhookWorker(): Promise<void> {
  if (webhookWorker) {
    await webhookWorker.close();
    webhookWorker = null;
    console.log('[WebhookWorker] Worker stopped');
  }

  if (webhookQueue) {
    await webhookQueue.close();
    webhookQueue = null;
    console.log('[WebhookQueue] Queue closed');
  }
}

/**
 * Add a webhook delivery job to the queue
 */
export async function enqueueWebhook(jobData: WebhookJobData): Promise<string> {
  const queue = getWebhookQueue();
  const job = await queue.add(`webhook-${jobData.payload.type}`, jobData, {
    jobId: jobData.payload.id, // Use webhook ID as job ID for deduplication
  });
  console.log(`[WebhookQueue] Enqueued webhook ${jobData.payload.id} (job ${job.id})`);
  return job.id!;
}
