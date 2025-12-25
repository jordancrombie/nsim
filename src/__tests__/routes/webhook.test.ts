import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import { MockWebhookRepository } from '../mocks/MockWebhookRepository';

// Mock the webhook queue
jest.unstable_mockModule('../../queue/webhook-queue', () => ({
  enqueueWebhook: jest.fn().mockResolvedValue(undefined),
}));

// Create a shared mock repository
let mockRepository: MockWebhookRepository;

// Mock the repository factory
jest.unstable_mockModule('../../repositories/index', () => ({
  getWebhookRepository: () => mockRepository,
  getPaymentRepository: jest.fn(),
  setWebhookRepository: jest.fn(),
  setPaymentRepository: jest.fn(),
  clearRepositories: jest.fn(),
}));

// Dynamic imports after mock setup
const { default: webhookRoutes } = await import('../../routes/webhook');
const { clearWebhookService } = await import('../../services/webhook');

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/api/v1/webhooks', webhookRoutes);
});

beforeEach(() => {
  mockRepository = new MockWebhookRepository();
  clearWebhookService();
});

afterEach(() => {
  mockRepository.clear();
  clearWebhookService();
});

describe('Webhook Routes', () => {
  describe('POST /api/v1/webhooks - Register webhook', () => {
    it('should register a new webhook', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-route-test',
          url: 'https://example.com/webhook',
          events: ['payment.authorized', 'payment.captured'],
        });

      expect(response.status).toBe(201);
      expect(response.body.id).toBeDefined();
      expect(response.body.merchantId).toBe('merchant-route-test');
      expect(response.body.url).toBe('https://example.com/webhook');
      expect(response.body.events).toEqual(['payment.authorized', 'payment.captured']);
      expect(response.body.secret).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
    });

    it('should return 400 for missing merchantId', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          url: 'https://example.com/webhook',
          events: ['payment.authorized'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 for missing url', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-test',
          events: ['payment.authorized'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 for missing events', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-test',
          url: 'https://example.com/webhook',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing required fields');
    });

    it('should return 400 for invalid URL', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-test',
          url: 'not-a-valid-url',
          events: ['payment.authorized'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid webhook URL');
    });

    it('should return 400 for empty events array', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-test',
          url: 'https://example.com/webhook',
          events: [],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Events must be a non-empty array');
    });

    it('should return 400 for invalid event types', async () => {
      const response = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-test',
          url: 'https://example.com/webhook',
          events: ['payment.authorized', 'invalid.event'],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid event types');
      expect(response.body.invalidEvents).toContain('invalid.event');
    });
  });

  describe('GET /api/v1/webhooks/:id', () => {
    it('should return webhook by ID', async () => {
      // First create a webhook
      const createResponse = await request(app)
        .post('/api/v1/webhooks')
        .send({
          merchantId: 'merchant-get-by-id',
          url: 'https://example.com/get-test',
          events: ['payment.voided'],
        });

      const webhookId = createResponse.body.id;

      // Then get it
      const response = await request(app).get(`/api/v1/webhooks/${webhookId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(webhookId);
      expect(response.body.merchantId).toBe('merchant-get-by-id');
      expect(response.body.url).toBe('https://example.com/get-test');
      expect(response.body.isActive).toBe(true);
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app).get('/api/v1/webhooks/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Webhook not found');
    });
  });

  describe('GET /api/v1/webhooks/merchant/:merchantId', () => {
    it('should return all webhooks for a merchant', async () => {
      const merchantId = 'merchant-list-' + Date.now();

      // Create two webhooks
      await request(app).post('/api/v1/webhooks').send({
        merchantId,
        url: 'https://example.com/webhook1',
        events: ['payment.authorized'],
      });

      await request(app).post('/api/v1/webhooks').send({
        merchantId,
        url: 'https://example.com/webhook2',
        events: ['payment.captured'],
      });

      const response = await request(app).get(`/api/v1/webhooks/merchant/${merchantId}`);

      expect(response.status).toBe(200);
      expect(response.body.merchantId).toBe(merchantId);
      expect(response.body.webhooks.length).toBe(2);
    });

    it('should return empty array for merchant with no webhooks', async () => {
      const response = await request(app).get('/api/v1/webhooks/merchant/no-webhooks-merchant');

      expect(response.status).toBe(200);
      expect(response.body.webhooks).toEqual([]);
    });
  });

  describe('PATCH /api/v1/webhooks/:id', () => {
    it('should update webhook URL', async () => {
      // Create webhook
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-patch-test',
        url: 'https://old-url.com/webhook',
        events: ['payment.authorized'],
      });

      const webhookId = createResponse.body.id;

      // Update URL
      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .send({ url: 'https://new-url.com/webhook' });

      expect(response.status).toBe(200);
      expect(response.body.url).toBe('https://new-url.com/webhook');
    });

    it('should update webhook events', async () => {
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-patch-events',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const webhookId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .send({ events: ['payment.authorized', 'payment.captured', 'payment.refunded'] });

      expect(response.status).toBe(200);
      expect(response.body.events).toEqual(['payment.authorized', 'payment.captured', 'payment.refunded']);
    });

    it('should update webhook active status', async () => {
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-patch-active',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const webhookId = createResponse.body.id;

      const response = await request(app)
        .patch(`/api/v1/webhooks/${webhookId}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
    });

    it('should return 400 for invalid URL', async () => {
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-patch-invalid',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const response = await request(app)
        .patch(`/api/v1/webhooks/${createResponse.body.id}`)
        .send({ url: 'not-a-url' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid webhook URL');
    });

    it('should return 400 for empty events array', async () => {
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-patch-empty-events',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const response = await request(app)
        .patch(`/api/v1/webhooks/${createResponse.body.id}`)
        .send({ events: [] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Events must be a non-empty array');
    });

    it('should return 400 for invalid event types', async () => {
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-patch-invalid-events',
        url: 'https://example.com/webhook',
        events: ['payment.authorized'],
      });

      const response = await request(app)
        .patch(`/api/v1/webhooks/${createResponse.body.id}`)
        .send({ events: ['invalid.event'] });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Invalid event types');
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app)
        .patch('/api/v1/webhooks/non-existent-id')
        .send({ url: 'https://new.com/webhook' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Webhook not found');
    });
  });

  describe('DELETE /api/v1/webhooks/:id', () => {
    it('should delete webhook', async () => {
      const createResponse = await request(app).post('/api/v1/webhooks').send({
        merchantId: 'merchant-delete-test',
        url: 'https://example.com/delete',
        events: ['payment.authorized'],
      });

      const webhookId = createResponse.body.id;

      const response = await request(app).delete(`/api/v1/webhooks/${webhookId}`);

      expect(response.status).toBe(204);

      // Verify it's gone
      const getResponse = await request(app).get(`/api/v1/webhooks/${webhookId}`);

      expect(getResponse.status).toBe(404);
    });

    it('should return 404 for non-existent webhook', async () => {
      const response = await request(app).delete('/api/v1/webhooks/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Webhook not found');
    });
  });

  describe('GET /api/v1/webhooks/admin/stats', () => {
    it('should return webhook statistics', async () => {
      const response = await request(app).get('/api/v1/webhooks/admin/stats');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('byMerchant');
    });
  });

  describe('GET /api/v1/webhooks/events/list', () => {
    it('should return valid event types', async () => {
      const response = await request(app).get('/api/v1/webhooks/events/list');

      expect(response.status).toBe(200);
      expect(response.body.events).toContain('payment.authorized');
      expect(response.body.events).toContain('payment.captured');
      expect(response.body.events).toContain('payment.voided');
      expect(response.body.events).toContain('payment.refunded');
      expect(response.body.events).toContain('payment.declined');
      expect(response.body.events).toContain('payment.expired');
      expect(response.body.events).toContain('payment.failed');
      expect(response.body.descriptions).toBeDefined();
    });
  });
});
