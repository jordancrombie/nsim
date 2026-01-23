/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'payment.authorized'
  | 'payment.captured'
  | 'payment.voided'
  | 'payment.refunded'
  | 'payment.declined'
  | 'payment.expired'
  | 'payment.failed';

/**
 * Webhook registration request
 */
export interface WebhookRegistration {
  merchantId: string;
  url: string;
  events: WebhookEventType[];
  secret?: string; // For HMAC signature verification
}

/**
 * Stored webhook configuration
 */
export interface WebhookConfig {
  id: string;
  merchantId: string;
  url: string;
  events: WebhookEventType[];
  secret: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

/**
 * Webhook payload sent to merchant
 */
export interface WebhookPayload {
  id: string; // Unique webhook delivery ID
  type: WebhookEventType;
  timestamp: string; // ISO 8601
  data: WebhookPayloadData;
}

/**
 * SACP: Agent context included in webhook payloads for AI agent-initiated transactions
 */
export interface WebhookAgentContext {
  agentId: string;
  ownerId: string;
  humanPresent: boolean;
}

/**
 * Data included in webhook payload
 */
export interface WebhookPayloadData {
  transactionId: string;
  merchantId: string;
  orderId: string;
  amount: number;
  currency: string;
  status: string;
  authorizationCode?: string;
  declineReason?: string;
  capturedAmount?: number;
  refundedAmount?: number;
  refundId?: string;
  /** SACP: Agent context if transaction was initiated by an AI agent */
  agentContext?: WebhookAgentContext;
}

/**
 * Webhook delivery job data
 */
export interface WebhookJobData {
  webhookId: string;
  webhookUrl: string;
  webhookSecret: string;
  payload: WebhookPayload;
  attempt: number;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  error?: string;
  deliveredAt?: Date;
}
