import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';

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

// Mock the webhook queue
jest.unstable_mockModule('../queue/webhook-queue', () => ({
  enqueueWebhook: jest.fn().mockResolvedValue('job-123'),
}));

// Import app after mocks
const { default: app } = await import('../app');

describe('App Integration', () => {
  describe('Middleware', () => {
    it('should have CORS headers enabled', async () => {
      const response = await request(app)
        .options('/health')
        .set('Origin', 'http://example.com');

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
      const response = await request(app)
        .post('/api/v1/payments/authorize')
        .send({
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
      const response = await request(app)
        .get('/api/v1/webhooks/events/list');

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
