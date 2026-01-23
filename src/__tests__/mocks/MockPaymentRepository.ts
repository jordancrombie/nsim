/**
 * Mock PaymentRepository for testing
 */

import { PaymentRepository } from '../../repositories/interfaces/PaymentRepository.js';
import { PaymentTransaction, PaymentStatus } from '../../types/payment.js';

export class MockPaymentRepository implements PaymentRepository {
  private transactions: Map<string, PaymentTransaction> = new Map();

  async create(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    this.transactions.set(transaction.id, { ...transaction });
    return { ...transaction };
  }

  async findById(id: string): Promise<PaymentTransaction | null> {
    const transaction = this.transactions.get(id);
    return transaction ? { ...transaction } : null;
  }

  async findByMerchantId(merchantId: string): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.merchantId === merchantId);
  }

  async findByOrderId(orderId: string): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.orderId === orderId);
  }

  async update(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction> {
    const existing = this.transactions.get(id);
    if (!existing) {
      throw new Error(`Transaction ${id} not found`);
    }
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.transactions.set(id, updated);
    return { ...updated };
  }

  async findExpiredAuthorizations(): Promise<PaymentTransaction[]> {
    const now = new Date();
    return Array.from(this.transactions.values()).filter(
      (t) => t.status === 'authorized' && t.expiresAt && t.expiresAt <= now
    );
  }

  async findByStatus(status: PaymentStatus): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.status === status);
  }

  async findByBsimId(bsimId: string): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.bsimId === bsimId);
  }

  async findByAgentId(agentId: string): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.agentId === agentId);
  }

  async findByAgentOwnerId(ownerId: string): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.agentOwnerId === ownerId);
  }

  async findByHumanPresent(humanPresent: boolean): Promise<PaymentTransaction[]> {
    return Array.from(this.transactions.values()).filter((t) => t.agentHumanPresent === humanPresent);
  }

  async countByStatus(): Promise<Record<PaymentStatus, number>> {
    const counts: Record<PaymentStatus, number> = {
      pending: 0,
      authorized: 0,
      captured: 0,
      voided: 0,
      refunded: 0,
      declined: 0,
      expired: 0,
      failed: 0,
    };
    for (const t of this.transactions.values()) {
      counts[t.status]++;
    }
    return counts;
  }

  async delete(id: string): Promise<boolean> {
    return this.transactions.delete(id);
  }

  // Test helper methods
  clear(): void {
    this.transactions.clear();
  }

  getAll(): PaymentTransaction[] {
    return Array.from(this.transactions.values());
  }
}
