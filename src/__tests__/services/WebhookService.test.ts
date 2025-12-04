import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the webhook queue before importing the service
jest.unstable_mockModule('../../queue/webhook-queue', () => ({
  enqueueWebhook: jest.fn().mockResolvedValue(undefined),
}));

// Dynamic import after mock setup
const { enqueueWebhook } = await import('../../queue/webhook-queue');
const {
  registerWebhook,
  getWebhook,
  getWebhooksForMerchant,
  updateWebhook,
  deleteWebhook,
  sendWebhookNotification,
  getWebhookStats,
} = await import('../../services/webhook');

describe('WebhookService', () => {
  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
  });

  describe('registerWebhook', () => {
    it('should register a new webhook with generated secret', () => {
      const webhook = registerWebhook({
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

    it('should register a webhook with provided secret', () => {
      const customSecret = 'my-custom-secret-key-12345';
      const webhook = registerWebhook({
        merchantId: 'merchant-test-2',
        url: 'https://example.com/webhook2',
        events: ['payment.refunded'],
        secret: customSecret,
      });

      expect(webhook.secret).toBe(customSecret);
    });

    it('should register multiple webhooks for the same merchant', () => {
      const webhook1 = registerWebhook({
        merchantId: 'merchant-multi',
        url: 'https://example.com/webhook1',
        events: ['payment.authorized'],
      });

      const webhook2 = registerWebhook({
        merchantId: 'merchant-multi',
        url: 'https://example.com/webhook2',
        events: ['payment.captured'],
      });

      expect(webhook1.id).not.toBe(webhook2.id);

      const merchantWebhooks = getWebhooksForMerchant('merchant-multi');
      expect(merchantWebhooks.length).toBe(2);
    });
  });

  describe('getWebhook', () => {
    it('should return webhook by ID', () => {
      const created = registerWebhook({
        merchantId: 'merchant-get-test',
        url: 'https://example.com/get-test',
        events: ['payment.voided'],
      });

      const retrieved = getWebhook(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
      expect(retrieved?.merchantId).toBe('merchant-get-test');
    });

    it('should return undefined for non-existent webhook', () => {
      const result = getWebhook('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('getWebhooksForMerchant', () => {
    it('should return all active webhooks for a merchant', () => {
      const merchantId = 'merchant-list-test-' + Date.now();

      registerWebhook({
        merchantId,
        url: 'https://example.com/list1',
        events: ['payment.authorized'],
      });

      registerWebhook({
        merchantId,
        url: 'https://example.com/list2',
        events: ['payment.captured'],
      });

      const webhooks = getWebhooksForMerchant(merchantId);
      expect(webhooks.length).toBe(2);
    });

    it('should return empty array for merchant with no webhooks', () => {
      const webhooks = getWebhooksForMerchant('non-existent-merchant');
      expect(webhooks).toEqual([]);
    });

    it('should not return inactive webhooks', () => {
      const merchantId = 'merchant-inactive-test-' + Date.now();

      const webhook = registerWebhook({
        merchantId,
        url: 'https://example.com/inactive',
        events: ['payment.authorized'],
      });

      // Deactivate the webhook
      updateWebhook(webhook.id, { isActive: false });

      const webhooks = getWebhooksForMerchant(merchantId);
      expect(webhooks.length).toBe(0);
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook URL', () => {
      const webhook = registerWebhook({
        merchantId: 'merchant-update-test',
        url: 'https://old-url.com/webhook',
        events: ['payment.authorized'],
      });

      const updated = updateWebhook(webhook.id, {
        url: 'https://new-url.com/webhook',
      });

      expect(updated?.url).toBe('https://new-url.com/webhook');
      expect(updated?.updatedAt.getTime()).toBeGreaterThanOrEqual(webhook.createdAt.getTime());
    });

    it('should update webhook events', () => {
      const webhook = registerWebhook({
        merchantId: 'merchant-update-events',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const updated = updateWebhook(webhook.id, {
        events: ['payment.authorized', 'payment.captured', 'payment.refunded'],
      });

      expect(updated?.events).toEqual(['payment.authorized', 'payment.captured', 'payment.refunded']);
    });

    it('should update webhook active status', () => {
      const webhook = registerWebhook({
        merchantId: 'merchant-update-active',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      expect(webhook.isActive).toBe(true);

      const updated = updateWebhook(webhook.id, { isActive: false });
      expect(updated?.isActive).toBe(false);
    });

    it('should return undefined for non-existent webhook', () => {
      const result = updateWebhook('non-existent-id', { url: 'https://new.com' });
      expect(result).toBeUndefined();
    });
  });

  describe('deleteWebhook', () => {
    it('should delete existing webhook', () => {
      const webhook = registerWebhook({
        merchantId: 'merchant-delete-test',
        url: 'https://example.com/delete',
        events: ['payment.authorized'],
      });

      const result = deleteWebhook(webhook.id);
      expect(result).toBe(true);

      const retrieved = getWebhook(webhook.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existent webhook', () => {
      const result = deleteWebhook('non-existent-id');
      expect(result).toBe(false);
    });

    it('should remove webhook from merchant index', () => {
      const merchantId = 'merchant-delete-index-' + Date.now();

      const webhook = registerWebhook({
        merchantId,
        url: 'https://example.com/delete-index',
        events: ['payment.authorized'],
      });

      expect(getWebhooksForMerchant(merchantId).length).toBe(1);

      deleteWebhook(webhook.id);

      expect(getWebhooksForMerchant(merchantId).length).toBe(0);
    });
  });

  describe('sendWebhookNotification', () => {
    it('should enqueue webhook for subscribed events', async () => {
      const merchantId = 'merchant-notify-' + Date.now();

      registerWebhook({
        merchantId,
        url: 'https://example.com/notify',
        events: ['payment.authorized', 'payment.captured'],
      });

      await sendWebhookNotification('payment.authorized', {
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

      registerWebhook({
        merchantId,
        url: 'https://example.com/notify',
        events: ['payment.captured'], // Only subscribed to captured
      });

      (enqueueWebhook as jest.Mock).mockClear();

      await sendWebhookNotification('payment.authorized', { // Sending authorized event
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

      await sendWebhookNotification('payment.authorized', {
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

      registerWebhook({
        merchantId,
        url: 'https://example.com/webhook1',
        events: ['payment.authorized'],
      });

      registerWebhook({
        merchantId,
        url: 'https://example.com/webhook2',
        events: ['payment.authorized'],
      });

      (enqueueWebhook as jest.Mock).mockClear();

      await sendWebhookNotification('payment.authorized', {
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
    it('should return webhook statistics', () => {
      const stats = getWebhookStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('byMerchant');
      expect(typeof stats.total).toBe('number');
      expect(typeof stats.byMerchant).toBe('object');
    });
  });
});
