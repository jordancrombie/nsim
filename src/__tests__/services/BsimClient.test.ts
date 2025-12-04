import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { BsimClient } from '../../services/bsim-client';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

describe('BsimClient', () => {
  let client: BsimClient;

  beforeEach(() => {
    client = new BsimClient();
    mockFetch.mockClear();
  });

  describe('authorize', () => {
    const validRequest = {
      cardToken: 'ctok_test_123',
      amount: 100,
      merchantId: 'merchant-123',
      merchantName: 'Test Store',
      orderId: 'order-456',
      description: 'Test purchase',
    };

    it('should return approved response on successful authorization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'approved',
          authorizationCode: 'AUTH-123',
          availableCredit: 900,
        }),
      });

      const response = await client.authorize(validRequest);

      expect(response.approved).toBe(true);
      expect(response.authorizationCode).toBe('AUTH-123');
      expect(response.availableCredit).toBe(900);
    });

    it('should return declined response when BSIM declines', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'declined',
          declineReason: 'Insufficient credit',
        }),
      });

      const response = await client.authorize(validRequest);

      expect(response.approved).toBe(false);
      expect(response.declineReason).toBe('Insufficient credit');
    });

    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const response = await client.authorize(validRequest);

      expect(response.approved).toBe(false);
      expect(response.declineReason).toBe('Network error');
    });

    it('should handle HTTP error responses', async () => {
      // Mock 500 error for all retry attempts (initial + 3 retries = 4 calls)
      const errorResponse = {
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      };
      mockFetch
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse)
        .mockResolvedValueOnce(errorResponse);

      const response = await client.authorize(validRequest);

      expect(response.approved).toBe(false);
      expect(response.declineReason).toContain('500');
    });

    it('should send correct request body to BSIM', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'approved', authorizationCode: 'AUTH-123' }),
      });

      await client.authorize(validRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/payment-network/authorize'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-API-Key': expect.any(String),
          }),
          body: expect.stringContaining('"cardToken":"ctok_test_123"'),
        })
      );
    });

    it('should default currency to CAD', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'approved', authorizationCode: 'AUTH-123' }),
      });

      await client.authorize(validRequest);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"currency":"CAD"'),
        })
      );
    });
  });

  describe('capture', () => {
    const captureRequest = {
      authorizationCode: 'AUTH-123',
      amount: 100,
    };

    it('should return success on successful capture', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await client.capture(captureRequest);

      expect(response.success).toBe(true);
    });

    it('should return error on failed capture', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Already captured' }),
      });

      const response = await client.capture(captureRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Already captured');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

      const response = await client.capture(captureRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Connection refused');
    });
  });

  describe('void', () => {
    const voidRequest = {
      authorizationCode: 'AUTH-123',
    };

    it('should return success on successful void', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await client.void(voidRequest);

      expect(response.success).toBe(true);
    });

    it('should return error when voiding captured authorization', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Cannot void captured authorization' }),
      });

      const response = await client.void(voidRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Cannot void captured authorization');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Timeout'));

      const response = await client.void(voidRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Timeout');
    });
  });

  describe('refund', () => {
    const refundRequest = {
      authorizationCode: 'AUTH-123',
      amount: 50,
    };

    it('should return success on successful refund', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      const response = await client.refund(refundRequest);

      expect(response.success).toBe(true);
    });

    it('should return error when refund amount exceeds captured amount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: false, error: 'Refund amount exceeds captured amount' }),
      });

      const response = await client.refund(refundRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Refund amount exceeds captured amount');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Service unavailable'));

      const response = await client.refund(refundRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBe('Service unavailable');
    });
  });

  describe('validateToken', () => {
    it('should return true for valid token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: true }),
      });

      const isValid = await client.validateToken('ctok_valid_123');

      expect(isValid).toBe(true);
    });

    it('should return false for invalid token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ valid: false }),
      });

      const isValid = await client.validateToken('ctok_invalid_123');

      expect(isValid).toBe(false);
    });

    it('should return false on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const isValid = await client.validateToken('ctok_test_123');

      expect(isValid).toBe(false);
    });
  });
});
