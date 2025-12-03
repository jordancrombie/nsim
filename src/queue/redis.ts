import { Redis } from 'ioredis';
import { config } from '../config/index.js';

let redisConnection: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!redisConnection) {
    const redisConfig = config.redis;

    if ('url' in redisConfig && redisConfig.url) {
      redisConnection = new Redis(redisConfig.url, {
        maxRetriesPerRequest: null, // Required for BullMQ
      });
    } else {
      redisConnection = new Redis({
        host: (redisConfig as any).host || 'localhost',
        port: (redisConfig as any).port || 6379,
        password: (redisConfig as any).password,
        maxRetriesPerRequest: null, // Required for BullMQ
      });
    }

    redisConnection.on('error', (err) => {
      console.error('[Redis] Connection error:', err.message);
    });

    redisConnection.on('connect', () => {
      console.log('[Redis] Connected successfully');
    });
  }

  return redisConnection;
}

export async function closeRedisConnection(): Promise<void> {
  if (redisConnection) {
    await redisConnection.quit();
    redisConnection = null;
    console.log('[Redis] Connection closed');
  }
}
