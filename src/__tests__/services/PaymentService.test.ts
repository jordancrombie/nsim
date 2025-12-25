import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { MockBsimClient } from '../mocks/MockBsimClient';
import { MockPaymentRepository } from '../mocks/MockPaymentRepository';

// Create shared mock instances - must be before the mock
let mockBsimClient: MockBsimClient;
let mockPaymentRepository: MockPaymentRepository;

// Mock the BsimClient
jest.unstable_mockModule('../../services/bsim-client', () => ({
  BsimClient: jest.fn().mockImplementation(() => mockBsimClient),
}));

// Mock the bsim-registry to return our mock providers
jest.unstable_mockModule('../../services/bsim-registry', () => ({
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

// Mock the webhook service to avoid database calls
jest.unstable_mockModule('../../services/webhook', () => ({
  sendWebhookNotification: jest.fn().mockResolvedValue(undefined),
}));

// Dynamic import after mock setup
const { PaymentService } = await import('../../services/payment');

describe('PaymentService', () => {
  let paymentService: PaymentService;

  beforeEach(() => {
    mockBsimClient = new MockBsimClient();
    mockPaymentRepository = new MockPaymentRepository();
    paymentService = new PaymentService(mockPaymentRepository);
  });

  afterEach(() => {
    mockBsimClient.clear();
    mockPaymentRepository.clear();
  });

  describe('authorize', () => {
    const validRequest = {
      merchantId: 'merchant-123',
      merchantName: 'Test Store',
      amount: 99.99,
      currency: 'CAD',
      cardToken: 'ctok_valid_token_123',
      orderId: 'order-456',
      description: 'Test purchase',
    };

    it('should create authorized transaction for valid request', async () => {
      const response = await paymentService.authorize(validRequest);

      expect(response.transactionId).toBeDefined();
      expect(response.status).toBe('authorized');
      expect(response.authorizationCode).toBeDefined();
      expect(response.timestamp).toBeDefined();
    });

    it('should return declined for invalid card token', async () => {
      const response = await paymentService.authorize({
        ...validRequest,
        cardToken: 'ctok_invalid_token',
      });

      expect(response.transactionId).toBeDefined();
      expect(response.status).toBe('declined');
      expect(response.declineReason).toBe('Invalid card token');
    });

    it('should create transaction record for successful authorization', async () => {
      const response = await paymentService.authorize(validRequest);

      const transaction = await paymentService.getTransaction(response.transactionId);
      expect(transaction).toBeDefined();
      expect(transaction!.merchantId).toBe(validRequest.merchantId);
      expect(transaction!.amount).toBe(validRequest.amount);
      expect(transaction!.status).toBe('authorized');
    });

    it('should create transaction record for declined authorization', async () => {
      const response = await paymentService.authorize({
        ...validRequest,
        cardToken: 'ctok_invalid_token',
      });

      const transaction = await paymentService.getTransaction(response.transactionId);
      expect(transaction).toBeDefined();
      expect(transaction!.status).toBe('declined');
      expect(transaction!.declineReason).toBe('Invalid card token');
    });

    it('should handle network errors from BSIM', async () => {
      mockBsimClient.shouldFailNetwork = true;

      const response = await paymentService.authorize(validRequest);

      expect(response.status).toBe('failed');
      expect(response.declineReason).toBe('Network error');
    });

    it('should track authorization calls to BSIM', async () => {
      await paymentService.authorize(validRequest);

      expect(mockBsimClient.authorizeCalls.length).toBe(1);
      expect(mockBsimClient.authorizeCalls[0].amount).toBe(validRequest.amount);
      expect(mockBsimClient.authorizeCalls[0].cardToken).toBe(validRequest.cardToken);
    });

    it('should default currency to CAD', async () => {
      const requestWithoutCurrency = {
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 50,
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-789',
        currency: '',
      };

      const response = await paymentService.authorize(requestWithoutCurrency);
      const transaction = await paymentService.getTransaction(response.transactionId);

      expect(transaction!.currency).toBe('CAD');
    });
  });

  describe('capture', () => {
    let authorizedTransactionId: string;
    let authCode: string;

    beforeEach(async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-capture-test',
      });
      authorizedTransactionId = authResponse.transactionId;
      authCode = authResponse.authorizationCode!;
    });

    it('should capture full amount by default', async () => {
      const response = await paymentService.capture({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('captured');
      expect(response.capturedAmount).toBe(100);
    });

    it('should capture partial amount', async () => {
      const response = await paymentService.capture({
        transactionId: authorizedTransactionId,
        amount: 50,
      });

      expect(response.status).toBe('captured');
      expect(response.capturedAmount).toBe(50);
    });

    it('should fail for non-existent transaction', async () => {
      const response = await paymentService.capture({
        transactionId: 'non-existent-id',
      });

      expect(response.status).toBe('failed');
    });

    it('should fail for already captured transaction', async () => {
      // First capture
      await paymentService.capture({ transactionId: authorizedTransactionId });

      // Second capture attempt
      const response = await paymentService.capture({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('captured'); // Already captured status returned
    });

    it('should update transaction status after capture', async () => {
      await paymentService.capture({ transactionId: authorizedTransactionId });

      const transaction = await paymentService.getTransaction(authorizedTransactionId);
      expect(transaction!.status).toBe('captured');
      expect(transaction!.capturedAmount).toBe(100);
    });
  });

  describe('void', () => {
    let authorizedTransactionId: string;

    beforeEach(async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-void-test',
      });
      authorizedTransactionId = authResponse.transactionId;
    });

    it('should void authorized transaction', async () => {
      const response = await paymentService.void({
        transactionId: authorizedTransactionId,
        reason: 'Customer cancelled',
      });

      expect(response.status).toBe('voided');
    });

    it('should fail for non-existent transaction', async () => {
      const response = await paymentService.void({
        transactionId: 'non-existent-id',
      });

      expect(response.status).toBe('failed');
    });

    it('should fail for captured transaction', async () => {
      // Capture first
      await paymentService.capture({ transactionId: authorizedTransactionId });

      // Try to void
      const response = await paymentService.void({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('captured'); // Returns current status
    });

    it('should update transaction status after void', async () => {
      await paymentService.void({ transactionId: authorizedTransactionId });

      const transaction = await paymentService.getTransaction(authorizedTransactionId);
      expect(transaction!.status).toBe('voided');
    });
  });

  describe('refund', () => {
    let capturedTransactionId: string;

    beforeEach(async () => {
      // Create and capture a transaction
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-refund-test',
      });
      capturedTransactionId = authResponse.transactionId;
      await paymentService.capture({ transactionId: capturedTransactionId });
    });

    it('should refund full captured amount by default', async () => {
      const response = await paymentService.refund({
        transactionId: capturedTransactionId,
        reason: 'Customer return',
      });

      expect(response.status).toBe('refunded');
      expect(response.refundedAmount).toBe(100);
      expect(response.refundId).toBeDefined();
    });

    it('should refund partial amount', async () => {
      const response = await paymentService.refund({
        transactionId: capturedTransactionId,
        amount: 30,
      });

      expect(response.refundedAmount).toBe(30);
    });

    it('should fail for non-existent transaction', async () => {
      const response = await paymentService.refund({
        transactionId: 'non-existent-id',
      });

      expect(response.status).toBe('failed');
    });

    it('should fail for non-captured transaction', async () => {
      // Create authorized but not captured transaction
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 50,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-uncaptured',
      });

      const response = await paymentService.refund({
        transactionId: authResponse.transactionId,
      });

      expect(response.status).toBe('authorized'); // Returns current status
    });

    it('should track cumulative refunds', async () => {
      await paymentService.refund({
        transactionId: capturedTransactionId,
        amount: 40,
      });

      const transaction = await paymentService.getTransaction(capturedTransactionId);
      expect(transaction!.refundedAmount).toBe(40);
    });
  });

  describe('capture - BSIM failures', () => {
    let authorizedTransactionId: string;

    beforeEach(async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-capture-fail-test-' + Date.now(),
      });
      authorizedTransactionId = authResponse.transactionId;
    });

    it('should handle BSIM capture failure', async () => {
      mockBsimClient.shouldFailCapture = true;

      const response = await paymentService.capture({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('failed');
      // Check transaction has decline reason stored
      const transaction = await paymentService.getTransaction(authorizedTransactionId);
      expect(transaction!.declineReason).toBeDefined();
    });

    it('should handle BSIM capture network error', async () => {
      mockBsimClient.shouldFailNetwork = true;

      const response = await paymentService.capture({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('failed');
      // Check transaction has network error as decline reason
      const transaction = await paymentService.getTransaction(authorizedTransactionId);
      expect(transaction!.declineReason).toBe('Network error');
    });
  });

  describe('void - BSIM failures', () => {
    let authorizedTransactionId: string;

    beforeEach(async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-void-fail-test-' + Date.now(),
      });
      authorizedTransactionId = authResponse.transactionId;
    });

    it('should handle BSIM void failure', async () => {
      mockBsimClient.shouldFailVoid = true;

      const response = await paymentService.void({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('failed');
      // Check transaction has decline reason stored
      const transaction = await paymentService.getTransaction(authorizedTransactionId);
      expect(transaction!.declineReason).toBeDefined();
    });

    it('should handle BSIM void network error', async () => {
      mockBsimClient.shouldFailNetwork = true;

      const response = await paymentService.void({
        transactionId: authorizedTransactionId,
      });

      expect(response.status).toBe('failed');
      // Check transaction has network error as decline reason
      const transaction = await paymentService.getTransaction(authorizedTransactionId);
      expect(transaction!.declineReason).toBe('Network error');
    });
  });

  describe('refund - BSIM failures', () => {
    let capturedTransactionId: string;

    beforeEach(async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-refund-fail-test-' + Date.now(),
      });
      capturedTransactionId = authResponse.transactionId;
      await paymentService.capture({ transactionId: capturedTransactionId });
    });

    it('should handle BSIM refund failure', async () => {
      mockBsimClient.shouldFailRefund = true;

      const response = await paymentService.refund({
        transactionId: capturedTransactionId,
      });

      expect(response.status).toBe('failed');
    });

    it('should handle BSIM refund network error', async () => {
      mockBsimClient.shouldFailNetwork = true;

      const response = await paymentService.refund({
        transactionId: capturedTransactionId,
      });

      expect(response.status).toBe('failed');
    });
  });

  describe('getExpiredAuthorizations', () => {
    it('should return empty array when no expired authorizations', async () => {
      // Create a fresh authorization (not expired)
      await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-not-expired-' + Date.now(),
      });

      const expired = await paymentService.getExpiredAuthorizations();

      // Fresh authorizations should not be expired
      expect(expired.filter((t) => t.orderId.includes('order-not-expired'))).toHaveLength(0);
    });

    it('should not include captured transactions', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-captured-' + Date.now(),
      });

      await paymentService.capture({ transactionId: authResponse.transactionId });

      const expired = await paymentService.getExpiredAuthorizations();
      const capturedTxn = expired.find((t) => t.id === authResponse.transactionId);

      expect(capturedTxn).toBeUndefined();
    });

    it('should not include voided transactions', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-voided-' + Date.now(),
      });

      await paymentService.void({ transactionId: authResponse.transactionId });

      const expired = await paymentService.getExpiredAuthorizations();
      const voidedTxn = expired.find((t) => t.id === authResponse.transactionId);

      expect(voidedTxn).toBeUndefined();
    });
  });

  describe('expireAuthorization', () => {
    it('should expire an authorized transaction', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-expire-test-' + Date.now(),
      });

      await paymentService.expireAuthorization(authResponse.transactionId);

      const transaction = await paymentService.getTransaction(authResponse.transactionId);
      expect(transaction!.status).toBe('expired');
    });

    it('should do nothing for non-existent transaction', async () => {
      // Should not throw
      await paymentService.expireAuthorization('non-existent-id');
    });

    it('should do nothing for already captured transaction', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-expire-captured-' + Date.now(),
      });

      await paymentService.capture({ transactionId: authResponse.transactionId });
      await paymentService.expireAuthorization(authResponse.transactionId);

      const transaction = await paymentService.getTransaction(authResponse.transactionId);
      expect(transaction!.status).toBe('captured'); // Should still be captured
    });

    it('should handle BSIM void failure gracefully during expiry', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 100,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-expire-bsim-fail-' + Date.now(),
      });

      mockBsimClient.shouldFailNetwork = true;

      // Should not throw, should still mark as expired locally
      await paymentService.expireAuthorization(authResponse.transactionId);

      const transaction = await paymentService.getTransaction(authResponse.transactionId);
      expect(transaction!.status).toBe('expired');
    });
  });

  describe('getTransaction', () => {
    it('should return transaction by ID', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 75,
        currency: 'CAD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-get-test',
        description: 'Test transaction',
      });

      const transaction = await paymentService.getTransaction(authResponse.transactionId);

      expect(transaction).toBeDefined();
      expect(transaction!.id).toBe(authResponse.transactionId);
      expect(transaction!.merchantId).toBe('merchant-123');
      expect(transaction!.amount).toBe(75);
      expect(transaction!.description).toBe('Test transaction');
    });

    it('should return null for non-existent transaction', async () => {
      const transaction = await paymentService.getTransaction('non-existent-id');

      expect(transaction).toBeNull();
    });

    it('should include all transaction details', async () => {
      const authResponse = await paymentService.authorize({
        merchantId: 'merchant-123',
        merchantName: 'Test Store',
        amount: 50,
        currency: 'USD',
        cardToken: 'ctok_valid_token_123',
        orderId: 'order-details',
        metadata: { customerId: 'cust-123' },
      });

      const transaction = await paymentService.getTransaction(authResponse.transactionId);

      expect(transaction!.merchantName).toBe('Test Store');
      expect(transaction!.orderId).toBe('order-details');
      expect(transaction!.currency).toBe('USD');
      expect(transaction!.cardToken).toBe('ctok_valid_token_123');
      expect(transaction!.metadata).toEqual({ customerId: 'cust-123' });
      expect(transaction!.createdAt).toBeDefined();
      expect(transaction!.updatedAt).toBeDefined();
      expect(transaction!.expiresAt).toBeDefined();
    });
  });
});
