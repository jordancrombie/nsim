import { config, BsimProvider } from '../config/index.js';

/**
 * Client for communicating with BSIM payment handler
 * Makes HTTP calls to BSIM's /api/payment-network endpoints
 *
 * Supports multi-BSIM routing by accepting provider config in constructor.
 */

/**
 * Delay execution for a specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if an error is retryable (network errors, 5xx responses)
 */
function isRetryableError(error: unknown): boolean {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return true;
  }

  // Our custom error format for HTTP errors
  if (error instanceof Error) {
    const message = error.message;
    // Retry on 5xx errors (server errors)
    if (/BSIM request failed: 5\d{2}/.test(message)) {
      return true;
    }
    // Retry on network-related errors
    if (
      message.includes('ECONNREFUSED') ||
      message.includes('ETIMEDOUT') ||
      message.includes('ENOTFOUND') ||
      message.includes('socket hang up') ||
      message.includes('network')
    ) {
      return true;
    }
  }

  return false;
}

/**
 * SACP: Agent context for AI agent-initiated transactions
 * Forwarded to BSIM for issuer visibility and risk assessment
 */
export interface BsimAgentContext {
  agentId: string;
  ownerId: string;
  humanPresent: boolean;
  mandateType?: 'cart' | 'intent' | 'none';
}

export interface BsimAuthorizationRequest {
  cardToken: string;
  amount: number;
  currency?: string;
  merchantId: string;
  merchantName: string;
  orderId: string;
  description?: string;
  /** SACP: Agent context if transaction initiated by AI agent */
  agentContext?: BsimAgentContext;
}

export interface BsimAuthorizationResponse {
  approved: boolean;
  authorizationCode?: string;
  declineReason?: string;
  availableCredit?: number;
}

export interface BsimCaptureRequest {
  authorizationCode: string;
  amount: number;
}

export interface BsimCaptureResponse {
  success: boolean;
  error?: string;
}

export interface BsimVoidRequest {
  authorizationCode: string;
}

export interface BsimVoidResponse {
  success: boolean;
  error?: string;
}

export interface BsimRefundRequest {
  authorizationCode: string;
  amount: number;
}

export interface BsimRefundResponse {
  success: boolean;
  error?: string;
}

export class BsimClient {
  private baseUrl: string;
  private apiKey: string;
  private bsimId: string;

  /**
   * Create a BSIM client
   * @param provider - Optional BSIM provider config. If not provided, uses default config.
   */
  constructor(provider?: BsimProvider) {
    if (provider) {
      this.baseUrl = provider.baseUrl;
      this.apiKey = provider.apiKey;
      this.bsimId = provider.bsimId;
    } else {
      // Legacy single-BSIM mode
      this.baseUrl = config.bsim.baseUrl;
      this.apiKey = config.bsim.apiKey;
      this.bsimId = 'bsim';
    }
  }

  /**
   * Get the BSIM ID this client is configured for
   */
  getBsimId(): string {
    return this.bsimId;
  }

  private async makeRequest<T>(endpoint: string, body: object): Promise<T> {
    const url = `${this.baseUrl}/api/payment-network${endpoint}`;
    const maxRetries = config.bsimRetry.maxRetries;
    const baseDelay = config.bsimRetry.retryDelayMs;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Exponential backoff: 500ms, 1000ms, 2000ms, etc.
          const retryDelay = baseDelay * Math.pow(2, attempt - 1);
          console.log(`[BsimClient] Retry attempt ${attempt}/${maxRetries} after ${retryDelay}ms`);
          await delay(retryDelay);
        }

        console.log(`[BsimClient] POST ${url} (attempt ${attempt + 1}/${maxRetries + 1})`);

        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': this.apiKey,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorText = await response.text();
          const error = new Error(`BSIM request failed: ${response.status} ${errorText}`);
          console.error(`[BsimClient] Error ${response.status}: ${errorText}`);

          // Check if we should retry
          if (response.status >= 500 && attempt < maxRetries) {
            lastError = error;
            continue; // Retry on 5xx errors
          }

          throw error;
        }

        return response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if error is retryable and we have retries left
        if (isRetryableError(error) && attempt < maxRetries) {
          console.warn(`[BsimClient] Retryable error on attempt ${attempt + 1}: ${lastError.message}`);
          continue;
        }

        // Non-retryable error or max retries reached
        throw lastError;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('Unknown error in makeRequest');
  }

  /**
   * Authorize a payment with BSIM
   * Validates card token and creates a hold on available credit
   */
  async authorize(request: BsimAuthorizationRequest): Promise<BsimAuthorizationResponse> {
    console.log('[BsimClient] Authorize request:', {
      ...request,
      cardToken: request.cardToken.substring(0, 10) + '...',
    });

    try {
      const response = await this.makeRequest<{
        status: 'approved' | 'declined' | 'error';
        authorizationCode?: string;
        declineReason?: string;
        availableCredit?: number;
      }>('/authorize', {
        cardToken: request.cardToken,
        amount: request.amount,
        currency: request.currency || 'CAD',
        merchantId: request.merchantId,
        merchantName: request.merchantName,
        orderId: request.orderId,
        description: request.description,
        // SACP: Forward agent context to BSIM for issuer visibility
        ...(request.agentContext && { agentContext: request.agentContext }),
      });

      console.log('[BsimClient] Authorize response:', response);

      return {
        approved: response.status === 'approved',
        authorizationCode: response.authorizationCode,
        declineReason: response.declineReason,
        availableCredit: response.availableCredit,
      };
    } catch (error) {
      console.error('[BsimClient] Authorize error:', error);
      return {
        approved: false,
        declineReason: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Capture an authorized payment
   * Converts the hold to an actual charge
   */
  async capture(request: BsimCaptureRequest): Promise<BsimCaptureResponse> {
    console.log('[BsimClient] Capture request:', request);

    try {
      const response = await this.makeRequest<{ success: boolean; error?: string }>(
        '/capture',
        {
          authorizationCode: request.authorizationCode,
          amount: request.amount,
        }
      );

      console.log('[BsimClient] Capture response:', response);
      return response;
    } catch (error) {
      console.error('[BsimClient] Capture error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Void an authorization
   * Releases the hold without charging
   */
  async void(request: BsimVoidRequest): Promise<BsimVoidResponse> {
    console.log('[BsimClient] Void request:', request);

    try {
      const response = await this.makeRequest<{ success: boolean; error?: string }>(
        '/void',
        {
          authorizationCode: request.authorizationCode,
        }
      );

      console.log('[BsimClient] Void response:', response);
      return response;
    } catch (error) {
      console.error('[BsimClient] Void error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Refund a captured payment
   * Credits the amount back to the card
   */
  async refund(request: BsimRefundRequest): Promise<BsimRefundResponse> {
    console.log('[BsimClient] Refund request:', request);

    try {
      const response = await this.makeRequest<{ success: boolean; error?: string }>(
        '/refund',
        {
          authorizationCode: request.authorizationCode,
          amount: request.amount,
        }
      );

      console.log('[BsimClient] Refund response:', response);
      return response;
    } catch (error) {
      console.error('[BsimClient] Refund error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate a card token
   * Checks if the token is valid and belongs to an active card
   */
  async validateToken(cardToken: string): Promise<boolean> {
    console.log('[BsimClient] Validate token:', cardToken.substring(0, 10) + '...');

    try {
      const response = await this.makeRequest<{ valid: boolean }>('/validate-token', {
        cardToken,
      });

      return response.valid;
    } catch (error) {
      console.error('[BsimClient] Validate token error:', error);
      return false;
    }
  }
}
