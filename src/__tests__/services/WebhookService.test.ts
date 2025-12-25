import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MockWebhookRepository } from '../mocks/MockWebhookRepository';

// Mock the webhook queue BEFORE importing any code that uses it
jest.unstable_mockModule('../../queue/webhook-queue', () => ({
  enqueueWebhook: jest.fn().mockResolvedValue(undefined),
}));

// Dynamic imports after mock setup - MUST come after all mocks are set up
const { enqueueWebhook } = await import('../../queue/webhook-queue');
const { WebhookService, clearWebhookService } = await import('../../services/webhook');

describe('WebhookService', () => {
  let webhookService: InstanceType<typeof WebhookService>;
  let mockRepository: MockWebhookRepository;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    // Create fresh instances
    mockRepository = new MockWebhookRepository();
    webhookService = new WebhookService(mockRepository);
  });

  afterEach(() => {
    mockRepository.clear();
    clearWebhookService();
  });

  describe('registerWebhook', () => {
    it('should register a new webhook with generated secret', async () => {
      const webhook = await webhookService.registerWebhook({
        merchantId: 'merchant-test-1',
        url: 'https://example.com/webhook',
        events: ['payment.authorized', 'payment.captured'],
      });

      expect(webhook.id).toBeDefined();
      expect(webhook.merchantId).toBe('merchant-test-1');
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toEqual(['payment.authorized', 'payment.captured']);
      expect(webhook.secret).toBeDefined();
      expect(webhook.secret.length).toBeGreaterThan(30);
      expect(webhook.isActive).toBe(true);
      expect(webhook.createdAt).toBeInstanceOf(Date);
      expect(webhook.updatedAt).toBeInstanceOf(Date);
    });

    it('should register a webhook with provided secret', async () => {
      const customSecret = 'my-custom-secret-key-12345';
      const webhook = await webhookService.registerWebhook({
        merchantId: 'merchant-test-2',
        url: 'https://example.com/webhook2',
        events: ['payment.refunded'],
        secret: customSecret,
      });

      expect(webhook.secret).toBe(customSecret);
    });

    it('should register multiple webhooks for the same merchant', async () => {
      const webhook1 = await webhookService.registerWebhook({
        merchantId: 'merchant-multi',
        url: 'https://example.com/webhook1',
        events: ['payment.authorized'],
      });

      const webhook2 = await webhookService.registerWebhook({
        merchantId: 'merchant-multi',
        url: 'https://example.com/webhook2',
        events: ['payment.captured'],
      });

      expect(webhook1.id).not.toBe(webhook2.id);

      const merchantWebhooks = await webhookService.getWebhooksForMerchant('merchant-multi');
      expect(merchantWebhooks.length).toBe(2);
    });
  });

  describe('getWebhook', () => {
    it('should return webhook by ID', async () => {
      const created = await webhookService.registerWebhook({
        merchantId: 'merchant-get-test',
        url: 'https://example.com/get-test',
        events: ['payment.voided'],
      });

      const retrieved = await webhookService.getWebhook(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.merchantId).toBe('merchant-get-test');
    });

    it('should return null for non-existent webhook', async () => {
      const result = await webhookService.getWebhook('non-existent-id');
      expect(result).toBeNull();
    });
  });

  describe('getWebhooksForMerchant', () => {
    it('should return all active webhooks for a merchant', async () => {
      const merchantId = 'merchant-list-test-' + Date.now();

      await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/list1',
        events: ['payment.authorized'],
      });

      await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/list2',
        events: ['payment.captured'],
      });

      const webhooks = await webhookService.getWebhooksForMerchant(merchantId);
      expect(webhooks.length).toBe(2);
    });

    it('should return empty array for merchant with no webhooks', async () => {
      const webhooks = await webhookService.getWebhooksForMerchant('non-existent-merchant');
      expect(webhooks).toEqual([]);
    });

    it('should not return inactive webhooks', async () => {
      const merchantId = 'merchant-inactive-test-' + Date.now();

      const webhook = await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/inactive',
        events: ['payment.authorized'],
      });

      // Deactivate the webhook
      await webhookService.updateWebhook(webhook.id, { isActive: false });

      const webhooks = await webhookService.getWebhooksForMerchant(merchantId);
      expect(webhooks.length).toBe(0);
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook URL', async () => {
      const webhook = await webhookService.registerWebhook({
        merchantId: 'merchant-update-test',
        url: 'https://old-url.com/webhook',
        events: ['payment.authorized'],
      });

      const updated = await webhookService.updateWebhook(webhook.id, {
        url: 'https://new-url.com/webhook',
      });

      expect(updated?.url).toBe('https://new-url.com/webhook');
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(webhook.createdAt.getTime());
    });

    it('should update webhook events', async () => {
      const webhook = await webhookService.registerWebhook({
        merchantId: 'merchant-update-events',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const updated = await webhookService.updateWebhook(webhook.id, {
        events: ['payment.authorized', 'payment.captured', 'payment.refunded'],
      });

      expect(updated?.events).toEqual(['payment.authorized', 'payment.captured', 'payment.refunded']);
    });

    it('should update webhook active status', async () => {
      const webhook = await webhookService.registerWebhook({
        merchantId: 'merchant-update-active',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      expect(webhook.isActive).toBe(true);

      const updated = await webhookService.updateWebhook(webhook.id, { isActive: false });
      expect(updated?.isActive).toBe(false);
    });

    it('should return null for non-existent webhook', async () => {
      const result = await webhookService.updateWebhook('non-existent-id', { url: 'https://new.com' });
      expect(result).toBeNull();
    });
  });

  describe('deleteWebhook', () => {
    it('should delete existing webhook', async () => {
      const webhook = await webhookService.registerWebhook({
        merchantId: 'merchant-delete-test',
        url: 'https://example.com/delete',
        events: ['payment.authorized'],
      });

      const result = await webhookService.deleteWebhook(webhook.id);
      expect(result).toBe(true);

      const retrieved = await webhookService.getWebhook(webhook.id);
      expect(retrieved).toBeNull();
    });

    it('should return false for non-existent webhook', async () => {
      const result = await webhookService.deleteWebhook('non-existent-id');
      expect(result).toBe(false);
    });

    it('should remove webhook from merchant index', async () => {
      const merchantId = 'merchant-delete-index-' + Date.now();

      const webhook = await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/delete-index',
        events: ['payment.authorized'],
      });

      expect((await webhookService.getWebhooksForMerchant(merchantId)).length).toBe(1);

      await webhookService.deleteWebhook(webhook.id);

      expect((await webhookService.getWebhooksForMerchant(merchantId)).length).toBe(0);
    });
  });

  describe('sendWebhookNotification', () => {
    it('should enqueue webhook for subscribed events', async () => {
      const merchantId = 'merchant-notify-' + Date.now();

      await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/notify',
        events: ['payment.authorized', 'payment.captured'],
      });

      await webhookService.sendWebhookNotification('payment.authorized', {
        transactionId: 'txn-123',
        merchantId,
        orderId: 'order-123',
        amount: 100,
        currency: 'CAD',
        status: 'authorized',
      });

      expect(enqueueWebhook).toHaveBeenCalled();
    });

    it('should not enqueue for unsubscribed events', async () => {
      const merchantId = 'merchant-no-notify-' + Date.now();

      await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/notify',
        events: ['payment.captured'], // Only subscribed to captured
      });

      (enqueueWebhook as jest.Mock).mockClear();

      await webhookService.sendWebhookNotification('payment.authorized', {
        // Sending authorized event
        transactionId: 'txn-456',
        merchantId,
        orderId: 'order-456',
        amount: 50,
        currency: 'CAD',
        status: 'authorized',
      });

      expect(enqueueWebhook).not.toHaveBeenCalled();
    });

    it('should not enqueue when no webhooks registered', async () => {
      (enqueueWebhook as jest.Mock).mockClear();

      await webhookService.sendWebhookNotification('payment.authorized', {
        transactionId: 'txn-789',
        merchantId: 'merchant-no-webhooks',
        orderId: 'order-789',
        amount: 25,
        currency: 'CAD',
        status: 'authorized',
      });

      expect(enqueueWebhook).not.toHaveBeenCalled();
    });

    it('should enqueue to multiple webhooks for same merchant', async () => {
      const merchantId = 'merchant-multi-notify-' + Date.now();

      await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/webhook1',
        events: ['payment.authorized'],
      });

      await webhookService.registerWebhook({
        merchantId,
        url: 'https://example.com/webhook2',
        events: ['payment.authorized'],
      });

      (enqueueWebhook as jest.Mock).mockClear();

      await webhookService.sendWebhookNotification('payment.authorized', {
        transactionId: 'txn-multi',
        merchantId,
        orderId: 'order-multi',
        amount: 200,
        currency: 'CAD',
        status: 'authorized',
      });

      expect(enqueueWebhook).toHaveBeenCalledTimes(2);
    });
  });

  describe('getWebhookStats', () => {
    it('should return webhook statistics', async () => {
      const stats = await webhookService.getWebhookStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byMerchant');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.byMerchant).toBe('object');
    });
  });
});
