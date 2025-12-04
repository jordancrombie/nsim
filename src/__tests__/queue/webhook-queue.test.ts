import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock ioredis
const mockRedis = {
  on: jest.fn(),
  quit: jest.fn(),
};

jest.unstable_mockModule('ioredis', () => ({
  Redis: jest.fn().mockImplementation(() => mockRedis),
}));

// Mock bullmq Queue and Worker
const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-123' }),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockWorker = {
  on: jest.fn(),
  close: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('bullmq', () => ({
  Queue: jest.fn().mockImplementation(() => mockQueue),
  Worker: jest.fn().mockImplementation(() => mockWorker),
}));

// Import after mocks
const {
  getWebhookQueue,
  enqueueWebhook,
  startWebhookWorker,
  stopWebhookWorker,
} = await import('../../queue/webhook-queue');

describe('Webhook Queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getWebhookQueue', () => {
    it('should create and return a queue instance', () => {
      const queue = getWebhookQueue();
      expect(queue).toBeDefined();
    });

    it('should return the same queue instance on subsequent calls', () => {
      const queue1 = getWebhookQueue();
      const queue2 = getWebhookQueue();
      expect(queue1).toBe(queue2);
    });
  });

  describe('enqueueWebhook', () => {
    it('should add job to the queue', async () => {
      const jobData = {
        webhookId: 'webhook-123',
        webhookUrl: 'https://example.com/webhook',
        webhookSecret: 'secret-key',
        payload: {
          id: 'payload-123',
          event: 'payment.authorized' as const,
          timestamp: new Date().toISOString(),
          data: {
            transactionId: 'txn-123',
            merchantId: 'merchant-123',
            orderId: 'order-123',
            amount: 100,
            currency: 'CAD',
            status: 'authorized' as const,
          },
        },
        attempt: 0,
      };

      const jobId = await enqueueWebhook(jobData);

      expect(jobId).toBe('job-123');
      expect(mockQueue.add).toHaveBeenCalledWith(
        'webhook-payment.authorized',
        jobData,
        expect.objectContaining({
          jobId: 'payload-123',
        })
      );
    });
  });

  describe('startWebhookWorker', () => {
    it('should create and return a worker instance with event handlers', () => {
      const worker = startWebhookWorker();
      expect(worker).toBeDefined();
      // Event handlers are registered on first worker creation
      expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should return the same worker instance on subsequent calls', () => {
      const worker1 = startWebhookWorker();
      const worker2 = startWebhookWorker();
      expect(worker1).toBe(worker2);
    });
  });

  describe('stopWebhookWorker', () => {
    it('should close worker and queue', async () => {
      // First start the worker
      startWebhookWorker();

      await stopWebhookWorker();

      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
});
