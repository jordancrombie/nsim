// Jest test setup file
import { jest } from '@jest/globals';

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.BSIM_BASE_URL = 'http://localhost:3001';
process.env.BSIM_API_KEY = 'test-api-key';
process.env.AUTH_EXPIRY_HOURS = '168';

// Increase test timeout for async operations
jest.setTimeout(10000);
