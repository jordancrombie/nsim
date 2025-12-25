/**
 * Prisma implementation of WebhookRepository
 */

import { PrismaClient, WebhookEventType as PrismaWebhookEventType } from '@prisma/client';
import { WebhookRepository, WebhookDeliveryRecord } from '../interfaces/WebhookRepository.js';
import { WebhookConfig, WebhookEventType } from '../../types/webhook.js';

/**
 * Map domain event type to Prisma enum
 * Domain uses dots (payment.authorized), Prisma uses underscores (payment_authorized)
 */
function toPrismaEventType(event: WebhookEventType): PrismaWebhookEventType {
  return event.replace('.', '_') as PrismaWebhookEventType;
}

/**
 * Map Prisma enum to domain event type
 */
function toDomainEventType(event: PrismaWebhookEventType): WebhookEventType {
  return event.replace('_', '.') as WebhookEventType;
}

/**
 * Convert Prisma webhook to domain webhook
 */
function toDomainWebhook(prismaWebhook: {
  id: string;
  merchantId: string;
  url: string;
  events: PrismaWebhookEventType[];
  secret: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): WebhookConfig {
  return {
    id: prismaWebhook.id,
    merchantId: prismaWebhook.merchantId,
    url: prismaWebhook.url,
    events: prismaWebhook.events.map(toDomainEventType),
    secret: prismaWebhook.secret,
    isActive: prismaWebhook.isActive,
    createdAt: prismaWebhook.createdAt,
    updatedAt: prismaWebhook.updatedAt,
  };
}

/**
 * Convert Prisma delivery to domain delivery
 */
function toDomainDelivery(prismaDelivery: {
  id: string;
  webhookId: string;
  event: PrismaWebhookEventType;
  payloadId: string;
  transactionId: string;
  attempt: number;
  success: boolean;
  statusCode: number | null;
  error: string | null;
  payload: unknown;
  deliveredAt: Date | null;
  createdAt: Date;
}): WebhookDeliveryRecord {
  return {
    id: prismaDelivery.id,
    webhookId: prismaDelivery.webhookId,
    event: toDomainEventType(prismaDelivery.event),
    payloadId: prismaDelivery.payloadId,
    transactionId: prismaDelivery.transactionId,
    attempt: prismaDelivery.attempt,
    success: prismaDelivery.success,
    statusCode: prismaDelivery.statusCode ?? undefined,
    error: prismaDelivery.error ?? undefined,
    payload: prismaDelivery.payload as object,
    deliveredAt: prismaDelivery.deliveredAt ?? undefined,
    createdAt: prismaDelivery.createdAt,
  };
}

export class PrismaWebhookRepository implements WebhookRepository {
  constructor(private prisma: PrismaClient) {}

  async create(config: Omit<WebhookConfig, 'createdAt' | 'updatedAt'>): Promise<WebhookConfig> {
    const created = await this.prisma.webhookConfig.create({
      data: {
        id: config.id,
        merchantId: config.merchantId,
        url: config.url,
        events: config.events.map(toPrismaEventType),
        secret: config.secret,
        isActive: config.isActive,
      },
    });
    return toDomainWebhook(created);
  }

  async findById(id: string): Promise<WebhookConfig | null> {
    const found = await this.prisma.webhookConfig.findUnique({
      where: { id },
    });
    return found ? toDomainWebhook(found) : null;
  }

  async findByMerchantId(merchantId: string, activeOnly = true): Promise<WebhookConfig[]> {
    const webhooks = await this.prisma.webhookConfig.findMany({
      where: {
        merchantId,
        ...(activeOnly && { isActive: true }),
      },
      orderBy: { createdAt: 'desc' },
    });
    return webhooks.map(toDomainWebhook);
  }

  async update(
    id: string,
    data: Partial<Pick<WebhookConfig, 'url' | 'events' | 'isActive'>>
  ): Promise<WebhookConfig | null> {
    try {
      const updated = await this.prisma.webhookConfig.update({
        where: { id },
        data: {
          ...(data.url !== undefined && { url: data.url }),
          ...(data.events !== undefined && { events: data.events.map(toPrismaEventType) }),
          ...(data.isActive !== undefined && { isActive: data.isActive }),
        },
      });
      return toDomainWebhook(updated);
    } catch {
      return null;
    }
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.webhookConfig.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }

  async getStats(): Promise<{ total: number; byMerchant: Record<string, number> }> {
    const [total, counts] = await Promise.all([
      this.prisma.webhookConfig.count(),
      this.prisma.webhookConfig.groupBy({
        by: ['merchantId'],
        _count: { merchantId: true },
      }),
    ]);

    const byMerchant: Record<string, number> = {};
    for (const count of counts) {
      byMerchant[count.merchantId] = count._count.merchantId;
    }

    return { total, byMerchant };
  }

  async recordDelivery(
    delivery: Omit<WebhookDeliveryRecord, 'id' | 'createdAt'>
  ): Promise<WebhookDeliveryRecord> {
    const created = await this.prisma.webhookDelivery.create({
      data: {
        webhookId: delivery.webhookId,
        event: toPrismaEventType(delivery.event),
        payloadId: delivery.payloadId,
        transactionId: delivery.transactionId,
        attempt: delivery.attempt,
        success: delivery.success,
        statusCode: delivery.statusCode,
        error: delivery.error,
        payload: delivery.payload,
        deliveredAt: delivery.deliveredAt,
      },
    });
    return toDomainDelivery(created);
  }

  async getDeliveryHistory(webhookId: string, limit = 100): Promise<WebhookDeliveryRecord[]> {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { webhookId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return deliveries.map(toDomainDelivery);
  }

  async getDeliveriesForTransaction(transactionId: string): Promise<WebhookDeliveryRecord[]> {
    const deliveries = await this.prisma.webhookDelivery.findMany({
      where: { transactionId },
      orderBy: { createdAt: 'desc' },
    });
    return deliveries.map(toDomainDelivery);
  }
}
