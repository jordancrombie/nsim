import { randomUUID } from 'crypto';
import { config } from '../config/index.js';
import {
  PaymentAuthorizationRequest,
  PaymentAuthorizationResponse,
  PaymentCaptureRequest,
  PaymentCaptureResponse,
  PaymentVoidRequest,
  PaymentVoidResponse,
  PaymentRefundRequest,
  PaymentRefundResponse,
  PaymentTransaction,
  PaymentStatus,
} from '../types/payment.js';
import { BsimClient } from './bsim-client.js';

/**
 * In-memory transaction store (will be replaced with PostgreSQL)
 */
const transactions = new Map<string, PaymentTransaction>();

export class PaymentService {
  private bsimClient: BsimClient;

  constructor() {
    this.bsimClient = new BsimClient();
  }

  async authorize(request: PaymentAuthorizationRequest): Promise<PaymentAuthorizationResponse> {
    const transactionId = randomUUID();
    const now = new Date();

    // Create transaction record
    const transaction: PaymentTransaction = {
      id: transactionId,
      merchantId: request.merchantId,
      merchantName: request.merchantName,
      orderId: request.orderId,
      cardToken: request.cardToken,
      amount: request.amount,
      currency: request.currency || 'CAD',
      status: 'pending',
      capturedAmount: 0,
      refundedAmount: 0,
      description: request.description,
      metadata: request.metadata,
      createdAt: now,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + config.authorizationExpiryHours * 60 * 60 * 1000),
    };

    // Call BSIM to authorize
    try {
      const bsimResponse = await this.bsimClient.authorize({
        cardToken: request.cardToken,
        amount: request.amount,
        merchantId: request.merchantId,
        merchantName: request.merchantName,
        orderId: request.orderId,
      });

      if (bsimResponse.approved) {
        transaction.status = 'authorized';
        transaction.authorizationCode = bsimResponse.authorizationCode;
      } else {
        transaction.status = 'declined';
        transaction.declineReason = bsimResponse.declineReason;
      }
    } catch (error) {
      console.error('BSIM authorization failed:', error);
      transaction.status = 'failed';
      transaction.declineReason = 'Network error';
    }

    transaction.updatedAt = new Date();
    transactions.set(transactionId, transaction);

    return {
      transactionId,
      status: transaction.status,
      authorizationCode: transaction.authorizationCode,
      declineReason: transaction.declineReason,
      timestamp: transaction.updatedAt.toISOString(),
    };
  }

  async capture(request: PaymentCaptureRequest): Promise<PaymentCaptureResponse> {
    const transaction = transactions.get(request.transactionId);

    if (!transaction) {
      return {
        transactionId: request.transactionId,
        status: 'failed',
        capturedAmount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    if (transaction.status !== 'authorized') {
      return {
        transactionId: request.transactionId,
        status: transaction.status,
        capturedAmount: transaction.capturedAmount,
        timestamp: new Date().toISOString(),
      };
    }

    const captureAmount = request.amount ?? transaction.amount;

    // Call BSIM to capture
    try {
      const bsimResponse = await this.bsimClient.capture({
        authorizationCode: transaction.authorizationCode!,
        amount: captureAmount,
      });

      if (bsimResponse.success) {
        transaction.status = 'captured';
        transaction.capturedAmount = captureAmount;
      } else {
        transaction.status = 'failed';
        transaction.declineReason = bsimResponse.error;
      }
    } catch (error) {
      console.error('BSIM capture failed:', error);
      transaction.status = 'failed';
      transaction.declineReason = 'Network error';
    }

    transaction.updatedAt = new Date();
    transactions.set(request.transactionId, transaction);

    return {
      transactionId: request.transactionId,
      status: transaction.status,
      capturedAmount: transaction.capturedAmount,
      timestamp: transaction.updatedAt.toISOString(),
    };
  }

  async void(request: PaymentVoidRequest): Promise<PaymentVoidResponse> {
    const transaction = transactions.get(request.transactionId);

    if (!transaction) {
      return {
        transactionId: request.transactionId,
        status: 'failed',
        timestamp: new Date().toISOString(),
      };
    }

    if (transaction.status !== 'authorized') {
      return {
        transactionId: request.transactionId,
        status: transaction.status,
        timestamp: new Date().toISOString(),
      };
    }

    // Call BSIM to void
    try {
      const bsimResponse = await this.bsimClient.void({
        authorizationCode: transaction.authorizationCode!,
      });

      if (bsimResponse.success) {
        transaction.status = 'voided';
      } else {
        transaction.status = 'failed';
        transaction.declineReason = bsimResponse.error;
      }
    } catch (error) {
      console.error('BSIM void failed:', error);
      transaction.status = 'failed';
      transaction.declineReason = 'Network error';
    }

    transaction.updatedAt = new Date();
    transactions.set(request.transactionId, transaction);

    return {
      transactionId: request.transactionId,
      status: transaction.status,
      timestamp: transaction.updatedAt.toISOString(),
    };
  }

  async refund(request: PaymentRefundRequest): Promise<PaymentRefundResponse> {
    const transaction = transactions.get(request.transactionId);
    const refundId = randomUUID();

    if (!transaction) {
      return {
        transactionId: request.transactionId,
        refundId,
        status: 'failed',
        refundedAmount: 0,
        timestamp: new Date().toISOString(),
      };
    }

    if (transaction.status !== 'captured') {
      return {
        transactionId: request.transactionId,
        refundId,
        status: transaction.status,
        refundedAmount: transaction.refundedAmount,
        timestamp: new Date().toISOString(),
      };
    }

    const refundAmount = request.amount ?? (transaction.capturedAmount - transaction.refundedAmount);

    // Call BSIM to refund
    try {
      const bsimResponse = await this.bsimClient.refund({
        authorizationCode: transaction.authorizationCode!,
        amount: refundAmount,
      });

      if (bsimResponse.success) {
        transaction.refundedAmount += refundAmount;
        if (transaction.refundedAmount >= transaction.capturedAmount) {
          transaction.status = 'refunded';
        }
      } else {
        return {
          transactionId: request.transactionId,
          refundId,
          status: 'failed',
          refundedAmount: transaction.refundedAmount,
          timestamp: new Date().toISOString(),
        };
      }
    } catch (error) {
      console.error('BSIM refund failed:', error);
      return {
        transactionId: request.transactionId,
        refundId,
        status: 'failed',
        refundedAmount: transaction.refundedAmount,
        timestamp: new Date().toISOString(),
      };
    }

    transaction.updatedAt = new Date();
    transactions.set(request.transactionId, transaction);

    return {
      transactionId: request.transactionId,
      refundId,
      status: transaction.status,
      refundedAmount: transaction.refundedAmount,
      timestamp: transaction.updatedAt.toISOString(),
    };
  }

  async getTransaction(transactionId: string): Promise<PaymentTransaction | null> {
    return transactions.get(transactionId) ?? null;
  }
}
