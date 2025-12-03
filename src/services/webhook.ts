import { randomUUID } from 'crypto';
import {
  WebhookConfig,
  WebhookRegistration,
  WebhookEventType,
  WebhookPayload,
  WebhookJobData,
  WebhookPayloadData,
} from '../types/webhook.js';
import { enqueueWebhook } from '../queue/webhook-queue.js';

/**
 * In-memory webhook store (will be replaced with PostgreSQL)
 */
const webhooks = new Map<string, WebhookConfig>();

// Index by merchantId for quick lookups
const merchantWebhooks = new Map<string, Set<string>>();

/**
 * Generate a random secret for HMAC signing
 */
function generateSecret(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

/**
 * Register a new webhook for a merchant
 */
export function registerWebhook(registration: WebhookRegistration): WebhookConfig {
  const webhookId = randomUUID();
  const now = new Date();

  const webhook: WebhookConfig = {
    id: webhookId,
    merchantId: registration.merchantId,
    url: registration.url,
    events: registration.events,
    secret: registration.secret || generateSecret(),
    createdAt: now,
    updatedAt: now,
    isActive: true,
  };

  webhooks.set(webhookId, webhook);

  // Add to merchant index
  if (!merchantWebhooks.has(registration.merchantId)) {
    merchantWebhooks.set(registration.merchantId, new Set());
  }
  merchantWebhooks.get(registration.merchantId)!.add(webhookId);

  console.log(`[WebhookService] Registered webhook ${webhookId} for merchant ${registration.merchantId}`);
  return webhook;
}

/**
 * Get a webhook by ID
 */
export function getWebhook(webhookId: string): WebhookConfig | undefined {
  return webhooks.get(webhookId);
}

/**
 * Get all webhooks for a merchant
 */
export function getWebhooksForMerchant(merchantId: string): WebhookConfig[] {
  const webhookIds = merchantWebhooks.get(merchantId);
  if (!webhookIds) return [];

  return Array.from(webhookIds)
    .map((id) => webhooks.get(id))
    .filter((w): w is WebhookConfig => w !== undefined && w.isActive);
}

/**
 * Update a webhook
 */
export function updateWebhook(
  webhookId: string,
  updates: Partial<Pick<WebhookConfig, 'url' | 'events' | 'isActive'>>
): WebhookConfig | undefined {
  const webhook = webhooks.get(webhookId);
  if (!webhook) return undefined;

  const updated: WebhookConfig = {
    ...webhook,
    ...updates,
    updatedAt: new Date(),
  };

  webhooks.set(webhookId, updated);
  console.log(`[WebhookService] Updated webhook ${webhookId}`);
  return updated;
}

/**
 * Delete a webhook
 */
export function deleteWebhook(webhookId: string): boolean {
  const webhook = webhooks.get(webhookId);
  if (!webhook) return false;

  webhooks.delete(webhookId);

  // Remove from merchant index
  const merchantSet = merchantWebhooks.get(webhook.merchantId);
  if (merchantSet) {
    merchantSet.delete(webhookId);
  }

  console.log(`[WebhookService] Deleted webhook ${webhookId}`);
  return true;
}

/**
 * Send webhook notification for a payment event
 */
export async function sendWebhookNotification(
  event: WebhookEventType,
  data: WebhookPayloadData
): Promise<void> {
  const webhooksForMerchant = getWebhooksForMerchant(data.merchantId);

  if (webhooksForMerchant.length === 0) {
    console.log(`[WebhookService] No webhooks registered for merchant ${data.merchantId}`);
    return;
  }

  for (const webhook of webhooksForMerchant) {
    // Check if webhook is subscribed to this event
    if (!webhook.events.includes(event)) {
      continue;
    }

    const payload: WebhookPayload = {
      id: randomUUID(),
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    const jobData: WebhookJobData = {
      webhookId: webhook.id,
      webhookUrl: webhook.url,
      webhookSecret: webhook.secret,
      payload,
      attempt: 0,
    };

    try {
      await enqueueWebhook(jobData);
    } catch (error) {
      console.error(`[WebhookService] Failed to enqueue webhook for ${webhook.id}:`, error);
    }
  }
}

/**
 * Get webhook statistics
 */
export function getWebhookStats(): { total: number; byMerchant: Record<string, number> } {
  const byMerchant: Record<string, number> = {};

  for (const [merchantId, webhookIds] of merchantWebhooks) {
    byMerchant[merchantId] = webhookIds.size;
  }

  return {
    total: webhooks.size,
    byMerchant,
  };
}
