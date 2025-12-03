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
import { sendWebhookNotification } from './webhook.js';

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

    // Send webhook notification
    const webhookEvent =
      transaction.status === 'authorized'
        ? 'payment.authorized'
        : transaction.status === 'declined'
          ? 'payment.declined'
          : 'payment.failed';

    sendWebhookNotification(webhookEvent, {
      transactionId,
      merchantId: request.merchantId,
      orderId: request.orderId,
      amount: request.amount,
      currency: transaction.currency,
      status: transaction.status,
      authorizationCode: transaction.authorizationCode,
      declineReason: transaction.declineReason,
    }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));

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

    // Send webhook notification
    if (transaction.status === 'captured') {
      sendWebhookNotification('payment.captured', {
        transactionId: request.transactionId,
        merchantId: transaction.merchantId,
        orderId: transaction.orderId,
        amount: transaction.capturedAmount,
        currency: transaction.currency,
        status: transaction.status,
        authorizationCode: transaction.authorizationCode,
      }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));
    }

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

    // Send webhook notification
    if (transaction.status === 'voided') {
      sendWebhookNotification('payment.voided', {
        transactionId: request.transactionId,
        merchantId: transaction.merchantId,
        orderId: transaction.orderId,
        amount: transaction.amount,
        currency: transaction.currency,
        status: transaction.status,
      }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));
    }

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

    // Send webhook notification for refund
    sendWebhookNotification('payment.refunded', {
      transactionId: request.transactionId,
      merchantId: transaction.merchantId,
      orderId: transaction.orderId,
      amount: refundAmount,
      currency: transaction.currency,
      status: transaction.status,
      refundId,
      refundedAmount: transaction.refundedAmount,
    }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));

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

  /**
   * Get all expired authorizations that need to be voided
   */
  async getExpiredAuthorizations(): Promise<PaymentTransaction[]> {
    const now = new Date();
    const expired: PaymentTransaction[] = [];

    for (const transaction of transactions.values()) {
      if (
        transaction.status === 'authorized' &&
        transaction.expiresAt &&
        transaction.expiresAt <= now
      ) {
        expired.push(transaction);
      }
    }

    return expired;
  }

  /**
   * Expire an authorization - void it and send webhook
   */
  async expireAuthorization(transactionId: string): Promise<void> {
    const transaction = transactions.get(transactionId);

    if (!transaction || transaction.status !== 'authorized') {
      return;
    }

    // Try to void with BSIM (but don't fail if BSIM is down)
    try {
      if (transaction.authorizationCode) {
        await this.bsimClient.void({
          authorizationCode: transaction.authorizationCode,
        });
      }
    } catch (error) {
      console.warn(`[PaymentService] Failed to void expired auth with BSIM: ${error}`);
    }

    // Mark as expired locally
    transaction.status = 'expired';
    transaction.updatedAt = new Date();
    transactions.set(transactionId, transaction);

    // Send webhook notification
    sendWebhookNotification('payment.expired', {
      transactionId,
      merchantId: transaction.merchantId,
      orderId: transaction.orderId,
      amount: transaction.amount,
      currency: transaction.currency,
      status: transaction.status,
    }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));
  }
}
