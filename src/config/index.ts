import dotenv from 'dotenv';

dotenv.config({ quiet: true });

// Parse Redis URL or use individual components
const parseRedisConfig = () => {
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    return { url: redisUrl };
  }
  return {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  };
};

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // BSIM connection
  bsim: {
    baseUrl: process.env.BSIM_BASE_URL || 'http://localhost:3001',
    apiKey: process.env.BSIM_API_KEY || 'dev-payment-api-key',
  },

  // Redis for job queue
  redis: parseRedisConfig(),

  // AWS SQS (production alternative)
  aws: {
    region: process.env.AWS_REGION || 'ca-central-1',
    sqsQueueUrl: process.env.AWS_SQS_QUEUE_URL,
  },

  // Authorization expiry (default 7 days)
  authorizationExpiryHours: parseInt(process.env.AUTH_EXPIRY_HOURS || '168', 10),

  // Webhook settings
  webhook: {
    maxRetries: parseInt(process.env.WEBHOOK_MAX_RETRIES || '5', 10),
    retryDelayMs: parseInt(process.env.WEBHOOK_RETRY_DELAY_MS || '1000', 10),
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '10000', 10),
  },

  // BSIM retry settings
  bsimRetry: {
    maxRetries: parseInt(process.env.BSIM_MAX_RETRIES || '3', 10),
    retryDelayMs: parseInt(process.env.BSIM_RETRY_DELAY_MS || '500', 10),
  },
};
