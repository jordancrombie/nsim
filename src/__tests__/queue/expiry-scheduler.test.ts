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

// Mock PaymentService
const mockPaymentService = {
  getExpiredAuthorizations: jest.fn().mockResolvedValue([]),
  expireAuthorization: jest.fn().mockResolvedValue(undefined),
};

jest.unstable_mockModule('../../services/payment', () => ({
  PaymentService: jest.fn().mockImplementation(() => mockPaymentService),
}));

// Import after mocks
const {
  getExpiryQueue,
  startExpiryWorker,
  startExpiryScheduler,
  stopExpiryScheduler,
} = await import('../../queue/expiry-scheduler');

describe('Expiry Scheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear timers
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('getExpiryQueue', () => {
    it('should create and return a queue instance', () => {
      const queue = getExpiryQueue();
      expect(queue).toBeDefined();
    });

    it('should return the same queue instance on subsequent calls', () => {
      const queue1 = getExpiryQueue();
      const queue2 = getExpiryQueue();
      expect(queue1).toBe(queue2);
    });
  });

  describe('startExpiryWorker', () => {
    it('should create and return a worker instance with event handlers', () => {
      const worker = startExpiryWorker();
      expect(worker).toBeDefined();
      // Event handlers are registered on first worker creation
      expect(mockWorker.on).toHaveBeenCalledWith('completed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('failed', expect.any(Function));
      expect(mockWorker.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should return the same worker instance on subsequent calls', () => {
      const worker1 = startExpiryWorker();
      const worker2 = startExpiryWorker();
      expect(worker1).toBe(worker2);
    });
  });

  describe('startExpiryScheduler', () => {
    it('should add an immediate job on startup', () => {
      startExpiryScheduler();
      expect(mockQueue.add).toHaveBeenCalledWith(
        'expiry-check',
        {},
        expect.objectContaining({ jobId: expect.stringContaining('expiry-check-') })
      );
    });

    it('should not start multiple schedulers', () => {
      startExpiryScheduler();
      const callCount = mockQueue.add.mock.calls.length;

      startExpiryScheduler(); // Second call should be ignored
      expect(mockQueue.add.mock.calls.length).toBe(callCount); // No additional calls
    });
  });

  describe('stopExpiryScheduler', () => {
    it('should close worker and queue', async () => {
      // First start the worker and scheduler
      startExpiryWorker();
      startExpiryScheduler();

      await stopExpiryScheduler();

      expect(mockWorker.close).toHaveBeenCalled();
      expect(mockQueue.close).toHaveBeenCalled();
    });
  });
});
