/**
 * Prisma implementation of PaymentRepository
 */

import { PrismaClient, PaymentStatus as PrismaPaymentStatus } from '@prisma/client';
import { PaymentRepository } from '../interfaces/PaymentRepository.js';
import { PaymentTransaction, PaymentStatus } from '../../types/payment.js';

/**
 * Convert Prisma PaymentStatus to domain PaymentStatus
 */
function toDomainStatus(status: PrismaPaymentStatus): PaymentStatus {
  return status as PaymentStatus;
}

/**
 * Convert domain PaymentStatus to Prisma PaymentStatus
 */
function toPrismaStatus(status: PaymentStatus): PrismaPaymentStatus {
  return status as PrismaPaymentStatus;
}

/**
 * Convert Prisma transaction to domain transaction
 */
function toDomainTransaction(prismaTransaction: {
  id: string;
  merchantId: string;
  merchantName: string;
  orderId: string;
  cardToken: string;
  amount: { toNumber(): number } | number;
  currency: string;
  status: PrismaPaymentStatus;
  authorizationCode: string | null;
  capturedAmount: { toNumber(): number } | number;
  refundedAmount: { toNumber(): number } | number;
  description: string | null;
  metadata: unknown;
  declineReason: string | null;
  bsimId: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}): PaymentTransaction {
  return {
    id: prismaTransaction.id,
    merchantId: prismaTransaction.merchantId,
    merchantName: prismaTransaction.merchantName,
    orderId: prismaTransaction.orderId,
    cardToken: prismaTransaction.cardToken,
    amount: typeof prismaTransaction.amount === 'number'
      ? prismaTransaction.amount
      : prismaTransaction.amount.toNumber(),
    currency: prismaTransaction.currency,
    status: toDomainStatus(prismaTransaction.status),
    authorizationCode: prismaTransaction.authorizationCode ?? undefined,
    capturedAmount: typeof prismaTransaction.capturedAmount === 'number'
      ? prismaTransaction.capturedAmount
      : prismaTransaction.capturedAmount.toNumber(),
    refundedAmount: typeof prismaTransaction.refundedAmount === 'number'
      ? prismaTransaction.refundedAmount
      : prismaTransaction.refundedAmount.toNumber(),
    description: prismaTransaction.description ?? undefined,
    metadata: prismaTransaction.metadata as Record<string, string> | undefined,
    declineReason: prismaTransaction.declineReason ?? undefined,
    bsimId: prismaTransaction.bsimId ?? undefined,
    createdAt: prismaTransaction.createdAt,
    updatedAt: prismaTransaction.updatedAt,
    expiresAt: prismaTransaction.expiresAt ?? undefined,
  };
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private prisma: PrismaClient) {}

  async create(transaction: PaymentTransaction): Promise<PaymentTransaction> {
    const created = await this.prisma.paymentTransaction.create({
      data: {
        id: transaction.id,
        merchantId: transaction.merchantId,
        merchantName: transaction.merchantName,
        orderId: transaction.orderId,
        cardToken: transaction.cardToken,
        amount: transaction.amount,
        currency: transaction.currency,
        status: toPrismaStatus(transaction.status),
        authorizationCode: transaction.authorizationCode,
        capturedAmount: transaction.capturedAmount,
        refundedAmount: transaction.refundedAmount,
        description: transaction.description,
        metadata: transaction.metadata ?? undefined,
        declineReason: transaction.declineReason,
        bsimId: transaction.bsimId,
        expiresAt: transaction.expiresAt,
      },
    });
    return toDomainTransaction(created);
  }

  async findById(id: string): Promise<PaymentTransaction | null> {
    const found = await this.prisma.paymentTransaction.findUnique({
      where: { id },
    });
    return found ? toDomainTransaction(found) : null;
  }

  async findByMerchantId(merchantId: string): Promise<PaymentTransaction[]> {
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
    });
    return transactions.map(toDomainTransaction);
  }

  async findByOrderId(orderId: string): Promise<PaymentTransaction[]> {
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
    return transactions.map(toDomainTransaction);
  }

  async update(id: string, data: Partial<PaymentTransaction>): Promise<PaymentTransaction> {
    const updated = await this.prisma.paymentTransaction.update({
      where: { id },
      data: {
        ...(data.status && { status: toPrismaStatus(data.status) }),
        ...(data.authorizationCode !== undefined && { authorizationCode: data.authorizationCode }),
        ...(data.capturedAmount !== undefined && { capturedAmount: data.capturedAmount }),
        ...(data.refundedAmount !== undefined && { refundedAmount: data.refundedAmount }),
        ...(data.declineReason !== undefined && { declineReason: data.declineReason }),
        ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
      },
    });
    return toDomainTransaction(updated);
  }

  async findExpiredAuthorizations(): Promise<PaymentTransaction[]> {
    const now = new Date();
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: {
        status: 'authorized',
        expiresAt: {
          lte: now,
        },
      },
    });
    return transactions.map(toDomainTransaction);
  }

  async findByStatus(status: PaymentStatus): Promise<PaymentTransaction[]> {
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: { status: toPrismaStatus(status) },
      orderBy: { createdAt: 'desc' },
    });
    return transactions.map(toDomainTransaction);
  }

  async findByBsimId(bsimId: string): Promise<PaymentTransaction[]> {
    const transactions = await this.prisma.paymentTransaction.findMany({
      where: { bsimId },
      orderBy: { createdAt: 'desc' },
    });
    return transactions.map(toDomainTransaction);
  }

  async countByStatus(): Promise<Record<PaymentStatus, number>> {
    const counts = await this.prisma.paymentTransaction.groupBy({
      by: ['status'],
      _count: { status: true },
    });

    const result: Record<PaymentStatus, number> = {
      pending: 0,
      authorized: 0,
      captured: 0,
      voided: 0,
      refunded: 0,
      declined: 0,
      expired: 0,
      failed: 0,
    };

    for (const count of counts) {
      result[toDomainStatus(count.status)] = count._count.status;
    }

    return result;
  }

  async delete(id: string): Promise<boolean> {
    try {
      await this.prisma.paymentTransaction.delete({
        where: { id },
      });
      return true;
    } catch {
      return false;
    }
  }
}
