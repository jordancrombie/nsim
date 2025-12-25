import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import request from 'supertest';
import { MockPaymentRepository } from './mocks/MockPaymentRepository';
import { MockWebhookRepository } from './mocks/MockWebhookRepository';

// Create shared mock instances
let mockPaymentRepository: MockPaymentRepository;
let mockWebhookRepository: MockWebhookRepository;

// Mock the BsimClient to avoid real HTTP calls
jest.unstable_mockModule('../services/bsim-client', () => ({
  BsimClient: jest.fn().mockImplementation(() => ({
    authorize: jest.fn().mockResolvedValue({
      approved: true,
      authorizationCode: 'AUTH-TEST-123',
      availableCredit: 1000,
    }),
    capture: jest.fn().mockResolvedValue({ success: true }),
    void: jest.fn().mockResolvedValue({ success: true }),
    refund: jest.fn().mockResolvedValue({ success: true }),
    validateToken: jest.fn().mockResolvedValue(true),
  })),
}));

// Mock the bsim-registry
jest.unstable_mockModule('../services/bsim-registry', () => ({
  bsimRegistry: {
    listProviders: () => [
      { bsimId: 'bsim', name: 'Bank Simulator', baseUrl: 'http://localhost:3001', apiKey: 'test-key' },
    ],
    getProvider: (bsimId: string) =>
      bsimId === 'bsim'
        ? { bsimId: 'bsim', name: 'Bank Simulator', baseUrl: 'http://localhost:3001', apiKey: 'test-key' }
        : undefined,
    getDefaultProvider: () => ({
      bsimId: 'bsim',
      name: 'Bank Simulator',
      baseUrl: 'http://localhost:3001',
      apiKey: 'test-key',
    }),
  },
}));

// Mock the webhook queue
jest.unstable_mockModule('../queue/webhook-queue', () => ({
  enqueueWebhook: jest.fn().mockResolvedValue('job-123'),
}));

// Mock the repository factory
jest.unstable_mockModule('../repositories/index', () => ({
  getPaymentRepository: () => mockPaymentRepository,
  getWebhookRepository: () => mockWebhookRepository,
  setPaymentRepository: jest.fn(),
  setWebhookRepository: jest.fn(),
  clearRepositories: jest.fn(),
}));

// Import app and services after mocks
const { default: app } = await import('../app');
const { clearPaymentService } = await import('../services/payment');
const { clearWebhookService } = await import('../services/webhook');

beforeEach(() => {
  mockPaymentRepository = new MockPaymentRepository();
  mockWebhookRepository = new MockWebhookRepository();
  clearPaymentService();
  clearWebhookService();
});

afterEach(() => {
  mockPaymentRepository?.clear();
  mockWebhookRepository?.clear();
  clearPaymentService();
  clearWebhookService();
});

describe('App Integration', () => {
  describe('Middleware', () => {
    it('should have CORS headers enabled', async () => {
      const response = await request(app).options('/health').set('Origin', 'http://example.com');

      // CORS should allow the request
      expect(response.headers['access-control-allow-origin']).toBeDefined();
    });

    it('should have security headers from helmet', async () => {
      const response = await request(app).get('/health');

      // Helmet adds various security headers
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
    });

    it('should parse JSON request bodies', async () => {
      const response = await request(app)
        .post('/api/v1/payments/authorize')
        .send({
          merchantId: 'test-merchant',
          amount: 100,
          cardToken: 'ctok_test',
          orderId: 'order-123',
        })
        .set('Content-Type', 'application/json');

      // Should parse JSON and process (may fail validation but that's ok)
      expect(response.status).not.toBe(415); // Not unsupported media type
    });
  });

  describe('Routes', () => {
    it('should mount health routes at /health', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
    });

    it('should mount payment routes at /api/v1/payments', async () => {
      const response = await request(app).post('/api/v1/payments/authorize').send({
        merchantId: 'test-merchant',
        merchantName: 'Test Store',
        amount: 50,
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-app-test',
      });

      // Should reach the payment routes
      expect([200, 400]).toContain(response.status);
    });

    it('should mount webhook routes at /api/v1/webhooks', async () => {
      const response = await request(app).get('/api/v1/webhooks/events/list');

      expect(response.status).toBe(200);
      expect(response.body.events).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/unknown/route');

      expect(response.status).toBe(404);
    });
  });
});
