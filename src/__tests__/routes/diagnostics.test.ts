import { jest, describe, it, expect } from '@jest/globals';
import request from 'supertest';

// Mock the BsimClient to avoid real HTTP calls
jest.unstable_mockModule('../../services/bsim-client', () => ({
  BsimClient: jest.fn().mockImplementation(() => ({
    authorize: jest.fn().mockResolvedValue({ approved: true }),
    capture: jest.fn().mockResolvedValue({ success: true }),
    void: jest.fn().mockResolvedValue({ success: true }),
    refund: jest.fn().mockResolvedValue({ success: true }),
    validateToken: jest.fn().mockResolvedValue(true),
  })),
}));

// Mock the webhook queue
jest.unstable_mockModule('../../queue/webhook-queue', () => ({
  enqueueWebhook: jest.fn().mockResolvedValue('job-123'),
}));

// Import app after mocks
const { default: app } = await import('../../app');

describe('Diagnostics Routes', () => {
  describe('POST /api/v1/diagnostics/analyze-token', () => {
    it('should return 400 if cardToken is missing', async () => {
      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Missing or invalid cardToken');
    });

    it('should analyze a simple prefixed token', async () => {
      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: 'ctok_abc123def456' });

      expect(response.status).toBe(200);
      expect(response.body.analysis.prefix).toBe('ctok_');
      expect(response.body.analysis.isJwt).toBe(false);
      expect(response.body.analysis.isWalletToken).toBe(false);
    });

    it('should identify wallet token prefix', async () => {
      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: 'wsim_bsim_abc123def456' });

      expect(response.status).toBe(200);
      expect(response.body.analysis.prefix).toBe('wsim_bsim_');
      expect(response.body.analysis.isWalletToken).toBe(true);
      expect(response.body.warnings).toContain(
        'Token identified as wallet payment token (wsim_bsim_ prefix or wallet_payment_token type)'
      );
    });

    it('should analyze a JWT token', async () => {
      // Create a simple JWT (header.payload.signature)
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment_token',
          iss: 'bsim',
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
          iat: Math.floor(Date.now() / 1000),
        })
      ).toString('base64');
      const signature = 'test-signature';
      const jwt = `${header}.${payload}.${signature}`;

      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: jwt });

      expect(response.status).toBe(200);
      expect(response.body.analysis.isJwt).toBe(true);
      expect(response.body.analysis.tokenType).toBe('payment_token');
      expect(response.body.jwtDetails).toBeDefined();
      expect(response.body.jwtDetails.type).toBe('payment_token');
      expect(response.body.jwtDetails.isExpired).toBe(false);
    });

    it('should identify wallet_payment_token JWT type', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          type: 'wallet_payment_token',
          iss: 'bsim',
          exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
          iat: Math.floor(Date.now() / 1000),
        })
      ).toString('base64');
      const signature = 'test-signature';
      const jwt = `${header}.${payload}.${signature}`;

      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: jwt });

      expect(response.status).toBe(200);
      expect(response.body.analysis.isWalletToken).toBe(true);
      expect(response.body.analysis.tokenType).toBe('wallet_payment_token');
      expect(response.body.warnings).toContain(
        'Token identified as wallet payment token (wsim_bsim_ prefix or wallet_payment_token type)'
      );
      expect(response.body.warnings).toContain(
        'Token type is wallet_payment_token - verify BSIM accepts this type'
      );
    });

    it('should detect expired JWT tokens', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment_token',
          iss: 'bsim',
          exp: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago (expired)
          iat: Math.floor(Date.now() / 1000) - 7200,
        })
      ).toString('base64');
      const signature = 'test-signature';
      const jwt = `${header}.${payload}.${signature}`;

      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: jwt });

      expect(response.status).toBe(200);
      expect(response.body.jwtDetails.isExpired).toBe(true);
      expect(response.body.warnings.some((w: string) => w.includes('EXPIRED'))).toBe(true);
    });

    it('should warn about tokens expiring soon', async () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment_token',
          iss: 'bsim',
          exp: Math.floor(Date.now() / 1000) + 120, // 2 minutes from now
          iat: Math.floor(Date.now() / 1000),
        })
      ).toString('base64');
      const signature = 'test-signature';
      const jwt = `${header}.${payload}.${signature}`;

      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: jwt });

      expect(response.status).toBe(200);
      expect(response.body.warnings.some((w: string) => w.includes('expires in'))).toBe(true);
    });

    it('should truncate token preview for long tokens', async () => {
      const longToken = 'ctok_' + 'a'.repeat(100);

      const response = await request(app)
        .post('/api/v1/diagnostics/analyze-token')
        .send({ cardToken: longToken });

      expect(response.status).toBe(200);
      expect(response.body.tokenPreview.length).toBeLessThan(longToken.length);
      expect(response.body.tokenPreview).toContain('...');
    });
  });

  describe('GET /api/v1/diagnostics/token-types', () => {
    it('should return supported token types and prefixes', async () => {
      const response = await request(app).get('/api/v1/diagnostics/token-types');

      expect(response.status).toBe(200);
      expect(response.body.supportedPrefixes).toBeDefined();
      expect(response.body.supportedJwtTypes).toBeDefined();
      expect(response.body.notes).toBeDefined();

      // Check ctok_ prefix is documented
      expect(response.body.supportedPrefixes.some((p: { prefix: string }) => p.prefix === 'ctok_')).toBe(true);

      // Check wsim_bsim_ prefix is documented
      expect(response.body.supportedPrefixes.some((p: { prefix: string }) => p.prefix === 'wsim_bsim_')).toBe(true);

      // Check wallet_payment_token type is documented
      expect(
        response.body.supportedJwtTypes.some((t: { type: string }) => t.type === 'wallet_payment_token')
      ).toBe(true);
    });
  });
});
