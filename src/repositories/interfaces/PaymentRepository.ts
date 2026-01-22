/**
 * Payment Repository Interface
 * Abstracts database operations for payment transactions
 */

import { PaymentTransaction, PaymentStatus } from '../../types/payment.js';

export interface PaymentRepository {
  /**
   * Create a new transaction
   */
  create(transaction: PaymentTransaction): Promise<PaymentTransaction>;

  /**
   * Find a transaction by ID
   */
  findById(id: string): Promise<PaymentTransaction | null>;

  /**
   * Find transactions by merchant ID
   */
  findByMerchantId(merchantId: string): Promise<PaymentTransaction[]>;

  /**
   * Find transactions by order ID
   */
  findByOrderId(orderId: string): Promise<PaymentTransaction[]>;

  /**
   * Update a transaction
   */
  update(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction>;

  /**
   * Find all expired authorizations
   * Returns transactions with status 'authorized' where expiresAt <= now
   */
  findExpiredAuthorizations(): Promise<PaymentTransaction[]>;

  /**
   * Find transactions by status
   */
  findByStatus(status: PaymentStatus): Promise<PaymentTransaction[]>;

  /**
   * Find transactions by BSIM ID
   */
  findByBsimId(bsimId: string): Promise<PaymentTransaction[]>;

  /**
   * SACP: Find transactions by agent ID
   */
  findByAgentId(agentId: string): Promise<PaymentTransaction[]>;

  /**
   * SACP: Find transactions by agent owner ID
   */
  findByAgentOwnerId(ownerId: string): Promise<PaymentTransaction[]>;

  /**
   * SACP: Find transactions where humanPresent matches
   */
  findByHumanPresent(humanPresent: boolean): Promise<PaymentTransaction[]>;

  /**
   * Count transactions by status
   */
  countByStatus(): Promise<Record<PaymentStatus, number>>;

  /**
   * Delete a transaction (for testing/cleanup)
   */
  delete(id: string): Promise<boolean>;
}
