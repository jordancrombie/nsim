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
import { WebhookRepository, getWebhookRepository } from '../repositories/index.js';

/**
 * Generate a random secret for HMAC signing
 */
function generateSecret(): string {
  return randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '');
}

/**
 * WebhookService - manages webhook configurations and notifications
 * Uses database persistence via WebhookRepository
 */
export class WebhookService {
  /** Repository for persisting webhook configurations */
  private repository: WebhookRepository;

  constructor(repository?: WebhookRepository) {
    this.repository = repository ?? getWebhookRepository();
  }

  /**
   * Register a new webhook for a merchant
   */
  async registerWebhook(registration: WebhookRegistration): Promise<WebhookConfig> {
    const webhookId = randomUUID();

    const webhook = await this.repository.create({
      id: webhookId,
      merchantId: registration.merchantId,
      url: registration.url,
      events: registration.events,
      secret: registration.secret || generateSecret(),
      isActive: true,
    });

    console.log(`[WebhookService] Registered webhook ${webhookId} for merchant ${registration.merchantId}`);
    return webhook;
  }

  /**
   * Get a webhook by ID
   */
  async getWebhook(webhookId: string): Promise<WebhookConfig | null> {
    return this.repository.findById(webhookId);
  }

  /**
   * Get all active webhooks for a merchant
   */
  async getWebhooksForMerchant(merchantId: string): Promise<WebhookConfig[]> {
    return this.repository.findByMerchantId(merchantId, true);
  }

  /**
   * Update a webhook
   */
  async updateWebhook(
    webhookId: string,
    updates: Partial<Pick<WebhookConfig, 'url' | 'events' | 'isActive'>>
  ): Promise<WebhookConfig | null> {
    const updated = await this.repository.update(webhookId, updates);
    if (updated) {
      console.log(`[WebhookService] Updated webhook ${webhookId}`);
    }
    return updated;
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string): Promise<boolean> {
    const deleted = await this.repository.delete(webhookId);
    if (deleted) {
      console.log(`[WebhookService] Deleted webhook ${webhookId}`);
    }
    return deleted;
  }

  /**
   * Send webhook notification for a payment event
   */
  async sendWebhookNotification(
    event: WebhookEventType,
    data: WebhookPayloadData
  ): Promise<void> {
    const webhooksForMerchant = await this.getWebhooksForMerchant(data.merchantId);

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
        type: event,
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
  async getWebhookStats(): Promise<{ total: number; byMerchant: Record<string, number> }> {
    return this.repository.getStats();
  }
}

// Default service instance
let webhookServiceInstance: WebhookService | null = null;

/**
 * Get the default webhook service instance
 */
export function getWebhookService(): WebhookService {
  if (!webhookServiceInstance) {
    webhookServiceInstance = new WebhookService();
  }
  return webhookServiceInstance;
}

/**
 * Set custom webhook service (for testing)
 */
export function setWebhookService(service: WebhookService): void {
  webhookServiceInstance = service;
}

/**
 * Clear webhook service singleton (for testing)
 */
export function clearWebhookService(): void {
  webhookServiceInstance = null;
}

// Backward-compatible module-level functions that delegate to the service instance
export async function registerWebhook(registration: WebhookRegistration): Promise<WebhookConfig> {
  return getWebhookService().registerWebhook(registration);
}

export async function getWebhook(webhookId: string): Promise<WebhookConfig | null> {
  return getWebhookService().getWebhook(webhookId);
}

export async function getWebhooksForMerchant(merchantId: string): Promise<WebhookConfig[]> {
  return getWebhookService().getWebhooksForMerchant(merchantId);
}

export async function updateWebhook(
  webhookId: string,
  updates: Partial<Pick<WebhookConfig, 'url' | 'events' | 'isActive'>>
): Promise<WebhookConfig | null> {
  return getWebhookService().updateWebhook(webhookId, updates);
}

export async function deleteWebhook(webhookId: string): Promise<boolean> {
  return getWebhookService().deleteWebhook(webhookId);
}

export async function sendWebhookNotification(
  event: WebhookEventType,
  data: WebhookPayloadData
): Promise<void> {
  return getWebhookService().sendWebhookNotification(event, data);
}

export async function getWebhookStats(): Promise<{ total: number; byMerchant: Record<string, number> }> {
  return getWebhookService().getWebhookStats();
}
