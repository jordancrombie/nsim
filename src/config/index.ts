import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // BSIM connection
  bsim: {
    baseUrl: process.env.BSIM_BASE_URL || 'http://localhost:3002',
    apiKey: process.env.BSIM_API_KEY || '',
  },

  // Redis for queue (local dev)
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD,
  },

  // AWS SQS (production)
  aws: {
    region: process.env.AWS_REGION || 'ca-central-1',
    sqsQueueUrl: process.env.AWS_SQS_QUEUE_URL,
  },

  // Authorization expiry (default 7 days)
  authorizationExpiryHours: parseInt(process.env.AUTH_EXPIRY_HOURS || '168', 10),

  // Use queue or synchronous processing
  useQueue: process.env.USE_QUEUE === 'true',
};
