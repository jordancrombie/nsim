/**
 * Mock WebhookRepository for testing
 */

import { WebhookRepository, WebhookDeliveryRecord } from '../../repositories/interfaces/WebhookRepository.js';
import { WebhookConfig, WebhookEventType } from '../../types/webhook.js';
import { randomUUID } from 'crypto';

export class MockWebhookRepository implements WebhookRepository {
  private webhooks: Map<string, WebhookConfig> = new Map();
  private deliveries: WebhookDeliveryRecord[] = [];

  async create(config: Omit<WebhookConfig, 'createdAt' | 'updatedAt'>): Promise<WebhookConfig> {
    const now = new Date();
    const webhook: WebhookConfig = {
      ...config,
      createdAt: now,
      updatedAt: now,
    };
    this.webhooks.set(config.id, webhook);
    return { ...webhook };
  }

  async findById(id: string): Promise<WebhookConfig | null> {
    const webhook = this.webhooks.get(id);
    return webhook ? { ...webhook } : null;
  }

  async findByMerchantId(merchantId: string, activeOnly = true): Promise<WebhookConfig[]> {
    return Array.from(this.webhooks.values()).filter(
      (w) => w.merchantId === merchantId && (!activeOnly || w.isActive)
    );
  }

  async update(
    id: string,
    data: Partial<Pick<WebhookConfig, 'url' | 'events' | 'isActive'>>
  ): Promise<WebhookConfig | null> {
    const existing = this.webhooks.get(id);
    if (!existing) {
      return null;
    }
    const updated: WebhookConfig = {
      ...existing,
      ...data,
      updatedAt: new Date(),
    };
    this.webhooks.set(id, updated);
    return { ...updated };
  }

  async delete(id: string): Promise<boolean> {
    return this.webhooks.delete(id);
  }

  async getStats(): Promise<{ total: number; byMerchant: Record<string, number> }> {
    const byMerchant: Record<string, number> = {};
    for (const webhook of this.webhooks.values()) {
      byMerchant[webhook.merchantId] = (byMerchant[webhook.merchantId] || 0) + 1;
    }
    return {
      total: this.webhooks.size,
      byMerchant,
    };
  }

  async recordDelivery(
    delivery: Omit<WebhookDeliveryRecord, 'id' | 'createdAt'>
  ): Promise<WebhookDeliveryRecord> {
    const record: WebhookDeliveryRecord = {
      ...delivery,
      id: randomUUID(),
      createdAt: new Date(),
    };
    this.deliveries.push(record);
    return { ...record };
  }

  async getDeliveryHistory(webhookId: string, limit = 100): Promise<WebhookDeliveryRecord[]> {
    return this.deliveries
      .filter((d) => d.webhookId === webhookId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  async getDeliveriesForTransaction(transactionId: string): Promise<WebhookDeliveryRecord[]> {
    return this.deliveries
      .filter((d) => d.transactionId === transactionId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  // Test helper methods
  clear(): void {
    this.webhooks.clear();
    this.deliveries = [];
  }

  getAll(): WebhookConfig[] {
    return Array.from(this.webhooks.values());
  }

  getAllDeliveries(): WebhookDeliveryRecord[] {
    return [...this.deliveries];
  }
}
