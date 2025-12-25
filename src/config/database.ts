/**
 * Database configuration and Prisma client singleton
 * Following BSIM's pattern for database connection management
 */

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

/**
 * Get the Prisma client singleton
 * Creates a new client if one doesn't exist
 */
export const getPrismaClient = (): PrismaClient => {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prisma;
};

/**
 * Disconnect from the database
 * Should be called during graceful shutdown
 */
export const disconnectDatabase = async (): Promise<void> => {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
    console.log('[Database] Disconnected from PostgreSQL');
  }
};

/**
 * Check database connection health
 */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    const client = getPrismaClient();
    await client.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('[Database] Connection check failed:', error);
    return false;
  }
};

/**
 * Initialize database connection
 * Should be called during application startup
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    const client = getPrismaClient();
    await client.$connect();
    console.log('[Database] Connected to PostgreSQL');
  } catch (error) {
    console.error('[Database] Failed to connect:', error);
    throw error;
  }
};
