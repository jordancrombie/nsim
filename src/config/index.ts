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

// BSIM Provider configuration
export interface BsimProvider {
  bsimId: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

// Parse BSIM providers from environment
// Supports:
//   1. BSIM_PROVIDERS JSON array: [{"bsimId":"bsim","name":"Bank Simulator","baseUrl":"...","apiKey":"..."}]
//   2. Individual env vars: BSIM_NEWBANK_URL, BSIM_NEWBANK_KEY, BSIM_NEWBANK_NAME
//   3. Legacy single BSIM: BSIM_BASE_URL, BSIM_API_KEY (becomes default "bsim" provider)
const parseBsimProviders = (): BsimProvider[] => {
  const providers: BsimProvider[] = [];

  // Try JSON format first
  const providersJson = process.env.BSIM_PROVIDERS;
  if (providersJson) {
    try {
      const parsed = JSON.parse(providersJson);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      console.error('[Config] Failed to parse BSIM_PROVIDERS JSON, falling back to env vars');
    }
  }

  // Default/primary BSIM (legacy support)
  providers.push({
    bsimId: 'bsim',
    name: process.env.BSIM_DEFAULT_NAME || 'Bank Simulator',
    baseUrl: process.env.BSIM_DEFAULT_URL || process.env.BSIM_BASE_URL || 'http://localhost:3001',
    apiKey: process.env.BSIM_DEFAULT_KEY || process.env.BSIM_API_KEY || 'dev-payment-api-key',
  });

  // NewBank BSIM (if configured)
  if (process.env.BSIM_NEWBANK_URL) {
    providers.push({
      bsimId: 'newbank',
      name: process.env.BSIM_NEWBANK_NAME || 'New Bank',
      baseUrl: process.env.BSIM_NEWBANK_URL,
      apiKey: process.env.BSIM_NEWBANK_KEY || 'dev-newbank-api-key',
    });
  }

  return providers;
};

export const config = {
  port: parseInt(process.env.PORT || '3006', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // BSIM connection (legacy single-provider config for backward compatibility)
  bsim: {
    baseUrl: process.env.BSIM_BASE_URL || 'http://localhost:3001',
    apiKey: process.env.BSIM_API_KEY || 'dev-payment-api-key',
  },

  // Multi-BSIM provider registry
  bsimProviders: parseBsimProviders(),

  // Default BSIM ID for tokens without bsimId prefix
  defaultBsimId: process.env.DEFAULT_BSIM_ID || 'bsim',

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
