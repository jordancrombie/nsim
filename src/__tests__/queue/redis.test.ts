import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock ioredis
const mockRedisInstance = {
  on: jest.fn(),
  quit: jest.fn().mockResolvedValue('OK'),
};

const MockRedis = jest.fn().mockImplementation(() => mockRedisInstance);

jest.unstable_mockModule('ioredis', () => ({
  Redis: MockRedis,
}));

// Import after mocks - use fresh imports for each test
let getRedisConnection: () => any;
let closeRedisConnection: () => Promise<void>;

describe('Redis Connection', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    // Reset module state by re-importing
    jest.resetModules();

    // Re-mock after reset
    jest.unstable_mockModule('ioredis', () => ({
      Redis: MockRedis,
    }));

    const redisModule = await import('../../queue/redis');
    getRedisConnection = redisModule.getRedisConnection;
    closeRedisConnection = redisModule.closeRedisConnection;
  });

  describe('getRedisConnection', () => {
    it('should create a Redis connection', () => {
      const connection = getRedisConnection();
      expect(connection).toBeDefined();
      expect(MockRedis).toHaveBeenCalled();
    });

    it('should return same connection on subsequent calls', () => {
      const conn1 = getRedisConnection();
      const conn2 = getRedisConnection();
      expect(conn1).toBe(conn2);
      expect(MockRedis).toHaveBeenCalledTimes(1);
    });

    it('should register error and connect event handlers', () => {
      getRedisConnection();
      expect(mockRedisInstance.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedisInstance.on).toHaveBeenCalledWith('connect', expect.any(Function));
    });
  });

  describe('closeRedisConnection', () => {
    it('should close the connection', async () => {
      getRedisConnection();
      await closeRedisConnection();
      expect(mockRedisInstance.quit).toHaveBeenCalled();
    });

    it('should do nothing if no connection exists', async () => {
      // Don't create connection, just try to close
      await closeRedisConnection();
      expect(mockRedisInstance.quit).not.toHaveBeenCalled();
    });
  });
});
