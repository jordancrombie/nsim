/**
 * Payment Network Types
 * Core types for payment processing between SSIM and BSIM
 */

export type PaymentStatus =
  | 'pending'
  | 'authorized'
  | 'captured'
  | 'voided'
  | 'refunded'
  | 'declined'
  | 'expired'
  | 'failed';

export type PaymentOperation =
  | 'authorize'
  | 'capture'
  | 'void'
  | 'refund';

export interface PaymentAuthorizationRequest {
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  cardToken: string;
  orderId: string;
  description?: string;
  metadata?: Record<string, string>;
}

export interface PaymentAuthorizationResponse {
  transactionId: string;
  status: PaymentStatus;
  authorizationCode?: string;
  declineReason?: string;
  timestamp: string;
}

export interface PaymentCaptureRequest {
  transactionId: string;
  amount?: number; // Optional for partial capture
}

export interface PaymentCaptureResponse {
  transactionId: string;
  status: PaymentStatus;
  capturedAmount: number;
  timestamp: string;
}

export interface PaymentVoidRequest {
  transactionId: string;
  reason?: string;
}

export interface PaymentVoidResponse {
  transactionId: string;
  status: PaymentStatus;
  timestamp: string;
}

export interface PaymentRefundRequest {
  transactionId: string;
  amount?: number; // Optional for partial refund
  reason?: string;
}

export interface PaymentRefundResponse {
  transactionId: string;
  refundId: string;
  status: PaymentStatus;
  refundedAmount: number;
  timestamp: string;
}

export interface PaymentTransaction {
  id: string;
  merchantId: string;
  merchantName: string;
  orderId: string;
  cardToken: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  authorizationCode?: string;
  capturedAmount: number;
  refundedAmount: number;
  description?: string;
  metadata?: Record<string, string>;
  declineReason?: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  /** The BSIM instance that processed this transaction (for multi-bank routing) */
  bsimId?: string;
}

export interface QueuedPaymentJob {
  id: string;
  operation: PaymentOperation;
  payload: PaymentAuthorizationRequest | PaymentCaptureRequest | PaymentVoidRequest | PaymentRefundRequest;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  processAfter?: Date;
  callbackUrl?: string;
}
