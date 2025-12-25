/**
 * Repository Layer
 *
 * Provides an abstraction layer for database operations.
 * Services use repository interfaces, allowing for easy testing
 * and swapping implementations (e.g., in-memory for tests, Prisma for production).
 */

// Interfaces
export * from './interfaces/index.js';

// Prisma implementations
export * from './prisma/index.js';

// Factory functions for creating repositories
import { PrismaClient } from '@prisma/client';
import { getPrismaClient } from '../config/database.js';
import { PaymentRepository } from './interfaces/PaymentRepository.js';
import { WebhookRepository } from './interfaces/WebhookRepository.js';
import { PrismaPaymentRepository } from './prisma/PrismaPaymentRepository.js';
import { PrismaWebhookRepository } from './prisma/PrismaWebhookRepository.js';

let paymentRepository: PaymentRepository | null = null;
let webhookRepository: WebhookRepository | null = null;

/**
 * Get the payment repository singleton
 * Uses Prisma implementation by default
 */
export function getPaymentRepository(prisma?: PrismaClient): PaymentRepository {
  if (!paymentRepository) {
    paymentRepository = new PrismaPaymentRepository(prisma ?? getPrismaClient());
  }
  return paymentRepository;
}

/**
 * Get the webhook repository singleton
 * Uses Prisma implementation by default
 */
export function getWebhookRepository(prisma?: PrismaClient): WebhookRepository {
  if (!webhookRepository) {
    webhookRepository = new PrismaWebhookRepository(prisma ?? getPrismaClient());
  }
  return webhookRepository;
}

/**
 * Set custom repository implementations (for testing)
 */
export function setPaymentRepository(repo: PaymentRepository): void {
  paymentRepository = repo;
}

export function setWebhookRepository(repo: WebhookRepository): void {
  webhookRepository = repo;
}

/**
 * Clear repository singletons (for testing)
 */
export function clearRepositories(): void {
  paymentRepository = null;
  webhookRepository = null;
}
