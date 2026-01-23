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

/**
 * SACP: Agent context for AI agent-initiated transactions
 * Included in authorization requests when a transaction is initiated by an AI agent
 */
export interface AgentContext {
  /** Unique agent identifier (e.g., 'agent_abc123') */
  agentId: string;
  /** Human owner of the agent - WSIM user ID (UUID) */
  ownerId: string;
  /** Was human present for this transaction? */
  humanPresent: boolean;
  /** Reference to authorization mandate (optional) */
  mandateId?: string;
  /** Type of mandate: 'cart' | 'intent' | 'none' */
  mandateType?: 'cart' | 'intent' | 'none';
}

export interface PaymentAuthorizationRequest {
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  cardToken: string;
  orderId: string;
  description?: string;
  metadata?: Record<string, string>;
  /** SACP: Agent context - present if transaction initiated by AI agent */
  agentContext?: AgentContext;
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

  // SACP: Agent context fields
  /** Agent ID if transaction initiated by AI agent */
  agentId?: string;
  /** Human owner of the agent (WSIM user ID) */
  agentOwnerId?: string;
  /** Was human present for this transaction? */
  agentHumanPresent?: boolean;
  /** Reference to authorization mandate */
  agentMandateId?: string;
  /** Type of mandate: 'cart' | 'intent' | 'none' */
  agentMandateType?: string;
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
