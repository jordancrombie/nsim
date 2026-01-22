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
} from '../types/payment.js';
import { BsimClient } from './bsim-client.js';
import { bsimRegistry } from './bsim-registry.js';
import { sendWebhookNotification } from './webhook.js';
import { PaymentRepository, getPaymentRepository } from '../repositories/index.js';
import { WebhookAgentContext } from '../types/webhook.js';

/**
 * SACP: Build agent context for webhook payload from transaction
 */
function buildWebhookAgentContext(transaction: PaymentTransaction): WebhookAgentContext | undefined {
  if (!transaction.agentId || !transaction.agentOwnerId) {
    return undefined;
  }
  return {
    agentId: transaction.agentId,
    ownerId: transaction.agentOwnerId,
    humanPresent: transaction.agentHumanPresent ?? false,
  };
}

/**
 * Token analysis utilities for debugging wallet payment flow
 */
export interface TokenAnalysis {
  prefix: string | null;
  bsimId: string | null;
  isJwt: boolean;
  jwtPayload: Record<string, unknown> | null;
  tokenType: string | null;
  isWalletToken: boolean;
  rawLength: number;
}

/**
 * Analyze a card token to extract debugging information
 * Supports both prefixed tokens (ctok_, wsim_{bsimId}_) and JWT tokens
 *
 * Token formats:
 *   - wsim_{bsimId}_{hash} → wallet token from specific BSIM (e.g., wsim_newbank_652eb18344a9)
 *   - ctok_{...} → consent token from default BSIM
 *   - JWT with bsimId claim → wallet payment token with embedded bsimId
 */
export function analyzeCardToken(cardToken: string): TokenAnalysis {
  const analysis: TokenAnalysis = {
    prefix: null,
    bsimId: null,
    isJwt: false,
    jwtPayload: null,
    tokenType: null,
    isWalletToken: false,
    rawLength: cardToken.length,
  };

  // Check for wsim_{bsimId}_ format first (e.g., wsim_newbank_652eb18344a9)
  const wsimMatch = cardToken.match(/^(wsim_([a-z0-9]+)_)/);
  if (wsimMatch) {
    analysis.prefix = wsimMatch[1];
    analysis.bsimId = wsimMatch[2];
    analysis.isWalletToken = true;
  } else {
    // Check for other known prefixes (ctok_, etc.)
    const prefixMatch = cardToken.match(/^([a-z_]+_)/);
    if (prefixMatch) {
      analysis.prefix = prefixMatch[1];
      // Legacy wsim_bsim_ format for backward compatibility
      if (analysis.prefix === 'wsim_bsim_') {
        analysis.isWalletToken = true;
        analysis.bsimId = 'bsim';
      }
    }
  }

  // Check if it's a JWT (three base64 segments separated by dots)
  const jwtParts = cardToken.split('.');
  if (jwtParts.length === 3) {
    analysis.isJwt = true;
    try {
      // Decode the payload (second segment)
      const payloadBase64 = jwtParts[1];
      const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
      const payload = JSON.parse(payloadJson);
      analysis.jwtPayload = payload;
      analysis.tokenType = payload.type || null;

      // Extract bsimId from JWT if present
      if (payload.bsimId && !analysis.bsimId) {
        analysis.bsimId = payload.bsimId;
      }

      // Check if it's a wallet payment token
      if (payload.type === 'wallet_payment_token') {
        analysis.isWalletToken = true;
      }
    } catch {
      // JWT decode failed, leave payload as null
    }
  }

  return analysis;
}

export class PaymentService {
  /** Cache of BSIM clients by bsimId for multi-bank routing */
  private bsimClients: Map<string, BsimClient> = new Map();

  /** Repository for persisting transactions */
  private repository: PaymentRepository;

  constructor(repository?: PaymentRepository) {
    // Use provided repository or get default
    this.repository = repository ?? getPaymentRepository();

    // Pre-initialize clients for all configured providers
    for (const provider of bsimRegistry.listProviders()) {
      this.bsimClients.set(provider.bsimId, new BsimClient(provider));
    }
    console.log(
      `[PaymentService] Initialized with ${this.bsimClients.size} BSIM client(s):`,
      Array.from(this.bsimClients.keys()).join(', ')
    );
  }

  /**
   * Get the BSIM client for a given bsimId
   * Falls back to default if not found
   */
  private getBsimClient(bsimId: string | null): BsimClient {
    const effectiveBsimId = bsimId || config.defaultBsimId;

    // Try to get cached client
    const client = this.bsimClients.get(effectiveBsimId);
    if (client) {
      return client;
    }

    // Fall back to default client
    const defaultClient = this.bsimClients.get(config.defaultBsimId);
    if (defaultClient) {
      console.warn(
        `[PaymentService] Unknown bsimId "${effectiveBsimId}", falling back to default "${config.defaultBsimId}"`
      );
      return defaultClient;
    }

    // Last resort: create a legacy client
    console.error('[PaymentService] No BSIM clients available, creating legacy client');
    return new BsimClient();
  }

  async authorize(request: PaymentAuthorizationRequest): Promise<PaymentAuthorizationResponse> {
    const transactionId = randomUUID();
    const now = new Date();

    // Analyze token for debugging and BSIM routing
    const tokenAnalysis = analyzeCardToken(request.cardToken);
    const bsimId = tokenAnalysis.bsimId || config.defaultBsimId;

    console.log('[PaymentService] Authorization request received:', {
      transactionId,
      merchantId: request.merchantId,
      orderId: request.orderId,
      amount: request.amount,
      currency: request.currency || 'CAD',
      bsimId,
      // SACP: Log agent context if present
      agentContext: request.agentContext ? {
        agentId: request.agentContext.agentId,
        ownerId: request.agentContext.ownerId,
        humanPresent: request.agentContext.humanPresent,
        mandateType: request.agentContext.mandateType,
      } : null,
      tokenAnalysis: {
        prefix: tokenAnalysis.prefix,
        bsimId: tokenAnalysis.bsimId,
        isJwt: tokenAnalysis.isJwt,
        tokenType: tokenAnalysis.tokenType,
        isWalletToken: tokenAnalysis.isWalletToken,
        rawLength: tokenAnalysis.rawLength,
        // Log JWT claims if present (excluding sensitive data)
        jwtClaims: tokenAnalysis.jwtPayload
          ? {
              type: tokenAnalysis.jwtPayload.type,
              iss: tokenAnalysis.jwtPayload.iss,
              exp: tokenAnalysis.jwtPayload.exp,
              iat: tokenAnalysis.jwtPayload.iat,
            }
          : null,
      },
    });

    // Create transaction record with bsimId for later operations
    let transaction: PaymentTransaction = {
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
      bsimId,
      // SACP: Store agent context if present
      agentId: request.agentContext?.agentId,
      agentOwnerId: request.agentContext?.ownerId,
      agentHumanPresent: request.agentContext?.humanPresent,
      agentMandateId: request.agentContext?.mandateId,
      agentMandateType: request.agentContext?.mandateType,
    };

    // Get the correct BSIM client based on token's bsimId
    const bsimClient = this.getBsimClient(bsimId);

    // Call BSIM to authorize
    try {
      console.log('[PaymentService] Forwarding to BSIM:', {
        transactionId,
        bsimId: bsimClient.getBsimId(),
        isWalletToken: tokenAnalysis.isWalletToken,
        tokenType: tokenAnalysis.tokenType,
      });

      const bsimResponse = await bsimClient.authorize({
        cardToken: request.cardToken,
        amount: request.amount,
        merchantId: request.merchantId,
        merchantName: request.merchantName,
        orderId: request.orderId,
        // SACP: Forward agent context to BSIM for issuer visibility
        ...(request.agentContext && {
          agentContext: {
            agentId: request.agentContext.agentId,
            ownerId: request.agentContext.ownerId,
            humanPresent: request.agentContext.humanPresent,
            mandateType: request.agentContext.mandateType,
          },
        }),
      });

      console.log('[PaymentService] BSIM response:', {
        transactionId,
        approved: bsimResponse.approved,
        declineReason: bsimResponse.declineReason,
        hasAuthCode: !!bsimResponse.authorizationCode,
      });

      if (bsimResponse.approved) {
        transaction.status = 'authorized';
        transaction.authorizationCode = bsimResponse.authorizationCode;
      } else {
        transaction.status = 'declined';
        transaction.declineReason = bsimResponse.declineReason;

        // Enhanced logging for wallet token failures
        if (tokenAnalysis.isWalletToken) {
          console.warn('[PaymentService] WALLET TOKEN DECLINED:', {
            transactionId,
            tokenType: tokenAnalysis.tokenType,
            declineReason: bsimResponse.declineReason,
            prefix: tokenAnalysis.prefix,
            jwtClaims: tokenAnalysis.jwtPayload
              ? {
                  type: tokenAnalysis.jwtPayload.type,
                  exp: tokenAnalysis.jwtPayload.exp,
                  iat: tokenAnalysis.jwtPayload.iat,
                }
              : null,
          });
        }
      }
    } catch (error) {
      console.error('[PaymentService] BSIM authorization failed:', {
        transactionId,
        error: error instanceof Error ? error.message : String(error),
        isWalletToken: tokenAnalysis.isWalletToken,
      });
      transaction.status = 'failed';
      transaction.declineReason = 'Network error';
    }

    transaction.updatedAt = new Date();

    // Persist transaction to database
    transaction = await this.repository.create(transaction);

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
      agentContext: buildWebhookAgentContext(transaction),
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
    const transaction = await this.repository.findById(request.transactionId);

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

    // Get the correct BSIM client based on transaction's bsimId
    const bsimClient = this.getBsimClient(transaction.bsimId || null);

    let updatedTransaction: PaymentTransaction;

    // Call BSIM to capture
    try {
      const bsimResponse = await bsimClient.capture({
        authorizationCode: transaction.authorizationCode!,
        amount: captureAmount,
      });

      if (bsimResponse.success) {
        updatedTransaction = await this.repository.update(request.transactionId, {
          status: 'captured',
          capturedAmount: captureAmount,
        });
      } else {
        updatedTransaction = await this.repository.update(request.transactionId, {
          status: 'failed',
          declineReason: bsimResponse.error,
        });
      }
    } catch (error) {
      console.error('BSIM capture failed:', error);
      updatedTransaction = await this.repository.update(request.transactionId, {
        status: 'failed',
        declineReason: 'Network error',
      });
    }

    // Send webhook notification
    if (updatedTransaction.status === 'captured') {
      sendWebhookNotification('payment.captured', {
        transactionId: request.transactionId,
        merchantId: updatedTransaction.merchantId,
        orderId: updatedTransaction.orderId,
        amount: updatedTransaction.capturedAmount,
        currency: updatedTransaction.currency,
        status: updatedTransaction.status,
        authorizationCode: updatedTransaction.authorizationCode,
        agentContext: buildWebhookAgentContext(updatedTransaction),
      }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));
    }

    return {
      transactionId: request.transactionId,
      status: updatedTransaction.status,
      capturedAmount: updatedTransaction.capturedAmount,
      timestamp: updatedTransaction.updatedAt.toISOString(),
    };
  }

  async void(request: PaymentVoidRequest): Promise<PaymentVoidResponse> {
    const transaction = await this.repository.findById(request.transactionId);

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

    // Get the correct BSIM client based on transaction's bsimId
    const bsimClient = this.getBsimClient(transaction.bsimId || null);

    let updatedTransaction: PaymentTransaction;

    // Call BSIM to void
    try {
      const bsimResponse = await bsimClient.void({
        authorizationCode: transaction.authorizationCode!,
      });

      if (bsimResponse.success) {
        updatedTransaction = await this.repository.update(request.transactionId, {
          status: 'voided',
        });
      } else {
        updatedTransaction = await this.repository.update(request.transactionId, {
          status: 'failed',
          declineReason: bsimResponse.error,
        });
      }
    } catch (error) {
      console.error('BSIM void failed:', error);
      updatedTransaction = await this.repository.update(request.transactionId, {
        status: 'failed',
        declineReason: 'Network error',
      });
    }

    // Send webhook notification
    if (updatedTransaction.status === 'voided') {
      sendWebhookNotification('payment.voided', {
        transactionId: request.transactionId,
        merchantId: updatedTransaction.merchantId,
        orderId: updatedTransaction.orderId,
        amount: updatedTransaction.amount,
        currency: updatedTransaction.currency,
        status: updatedTransaction.status,
        agentContext: buildWebhookAgentContext(updatedTransaction),
      }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));
    }

    return {
      transactionId: request.transactionId,
      status: updatedTransaction.status,
      timestamp: updatedTransaction.updatedAt.toISOString(),
    };
  }

  async refund(request: PaymentRefundRequest): Promise<PaymentRefundResponse> {
    const transaction = await this.repository.findById(request.transactionId);
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

    // Get the correct BSIM client based on transaction's bsimId
    const bsimClient = this.getBsimClient(transaction.bsimId || null);

    // Call BSIM to refund
    try {
      const bsimResponse = await bsimClient.refund({
        authorizationCode: transaction.authorizationCode!,
        amount: refundAmount,
      });

      if (bsimResponse.success) {
        const newRefundedAmount = transaction.refundedAmount + refundAmount;
        const newStatus = newRefundedAmount >= transaction.capturedAmount ? 'refunded' : transaction.status;

        const updatedTransaction = await this.repository.update(request.transactionId, {
          status: newStatus,
          refundedAmount: newRefundedAmount,
        });

        // Send webhook notification for refund
        sendWebhookNotification('payment.refunded', {
          transactionId: request.transactionId,
          merchantId: updatedTransaction.merchantId,
          orderId: updatedTransaction.orderId,
          amount: refundAmount,
          currency: updatedTransaction.currency,
          status: updatedTransaction.status,
          refundId,
          refundedAmount: updatedTransaction.refundedAmount,
          agentContext: buildWebhookAgentContext(updatedTransaction),
        }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));

        return {
          transactionId: request.transactionId,
          refundId,
          status: updatedTransaction.status,
          refundedAmount: updatedTransaction.refundedAmount,
          timestamp: updatedTransaction.updatedAt.toISOString(),
        };
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
  }

  async getTransaction(transactionId: string): Promise<PaymentTransaction | null> {
    return this.repository.findById(transactionId);
  }

  /**
   * SACP: Get transactions by agent ID
   */
  async getTransactionsByAgentId(agentId: string): Promise<PaymentTransaction[]> {
    return this.repository.findByAgentId(agentId);
  }

  /**
   * SACP: Get transactions by agent owner ID
   */
  async getTransactionsByOwnerId(ownerId: string): Promise<PaymentTransaction[]> {
    return this.repository.findByAgentOwnerId(ownerId);
  }

  /**
   * SACP: Get transactions by human presence
   */
  async getTransactionsByHumanPresent(humanPresent: boolean): Promise<PaymentTransaction[]> {
    return this.repository.findByHumanPresent(humanPresent);
  }

  /**
   * Get all expired authorizations that need to be voided
   */
  async getExpiredAuthorizations(): Promise<PaymentTransaction[]> {
    return this.repository.findExpiredAuthorizations();
  }

  /**
   * Expire an authorization - void it and send webhook
   */
  async expireAuthorization(transactionId: string): Promise<void> {
    const transaction = await this.repository.findById(transactionId);

    if (!transaction || transaction.status !== 'authorized') {
      return;
    }

    // Get the correct BSIM client based on transaction's bsimId
    const bsimClient = this.getBsimClient(transaction.bsimId || null);

    // Try to void with BSIM (but don't fail if BSIM is down)
    try {
      if (transaction.authorizationCode) {
        await bsimClient.void({
          authorizationCode: transaction.authorizationCode,
        });
      }
    } catch (error) {
      console.warn(`[PaymentService] Failed to void expired auth with BSIM: ${error}`);
    }

    // Mark as expired in database
    const updatedTransaction = await this.repository.update(transactionId, {
      status: 'expired',
    });

    // Send webhook notification
    sendWebhookNotification('payment.expired', {
      transactionId,
      merchantId: updatedTransaction.merchantId,
      orderId: updatedTransaction.orderId,
      amount: updatedTransaction.amount,
      currency: updatedTransaction.currency,
      status: updatedTransaction.status,
      agentContext: buildWebhookAgentContext(updatedTransaction),
    }).catch((err) => console.error('[PaymentService] Webhook notification error:', err));
  }
}

// Default service instance
let paymentServiceInstance: PaymentService | null = null;

/**
 * Get the default payment service instance
 */
export function getPaymentService(): PaymentService {
  if (!paymentServiceInstance) {
    paymentServiceInstance = new PaymentService();
  }
  return paymentServiceInstance;
}

/**
 * Set custom payment service (for testing)
 */
export function setPaymentService(service: PaymentService): void {
  paymentServiceInstance = service;
}

/**
 * Clear payment service singleton (for testing)
 */
export function clearPaymentService(): void {
  paymentServiceInstance = null;
}
