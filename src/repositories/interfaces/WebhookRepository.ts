/**
 * Webhook Repository Interface
 * Abstracts database operations for webhook configurations
 */

import { WebhookConfig, WebhookEventType } from '../../types/webhook.js';

export interface WebhookDeliveryRecord {
  id: string;
  webhookId: string;
  event: WebhookEventType;
  payloadId: string;
  transactionId: string;
  attempt: number;
  success: boolean;
  statusCode?: number;
  error?: string;
  payload: object;
  deliveredAt?: Date;
  createdAt: Date;
}

export interface WebhookRepository {
  /**
   * Create a new webhook configuration
   */
  create(config: Omit<WebhookConfig, 'createdAt' | 'updatedAt'>): Promise<WebhookConfig>;

  /**
   * Find a webhook by ID
   */
  findById(id: string): Promise<WebhookConfig | null>;

  /**
   * Find all active webhooks for a merchant
   */
  findByMerchantId(merchantId: string, activeOnly?: boolean): Promise<WebhookConfig[]>;

  /**
   * Update a webhook configuration
   */
  update(
    id: string,
    data: Partial<Pick<WebhookConfig, 'url' | 'events' | 'isActive'>>
  ): Promise<WebhookConfig | null>;

  /**
   * Delete a webhook configuration
   */
  delete(id: string): Promise<boolean>;

  /**
   * Get webhook statistics
   */
  getStats(): Promise<{ total: number; byMerchant: Record<string, number> }>;

  /**
   * Record a webhook delivery attempt
   */
  recordDelivery(delivery: Omit<WebhookDeliveryRecord, 'id' | 'createdAt'>): Promise<WebhookDeliveryRecord>;

  /**
   * Get delivery history for a webhook
   */
  getDeliveryHistory(webhookId: string, limit?: number): Promise<WebhookDeliveryRecord[]>;

  /**
   * Get delivery history for a transaction
   */
  getDeliveriesForTransaction(transactionId: string): Promise<WebhookDeliveryRecord[]>;
}
