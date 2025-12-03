import { config } from '../config/index.js';

/**
 * Client for communicating with BSIM payment handler
 * Makes HTTP calls to BSIM's /api/payment-network endpoints
 */

export interface BsimAuthorizationRequest {
  cardToken: string;
  amount: number;
  currency?: string;
  merchantId: string;
  merchantName: string;
  orderId: string;
  description?: string;
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

  constructor() {
    this.baseUrl = config.bsim.baseUrl;
    this.apiKey = config.bsim.apiKey;
  }

  private async makeRequest<T>(endpoint: string, body: object): Promise<T> {
    const url = `${this.baseUrl}/api/payment-network${endpoint}`;
    console.log(`[BsimClient] POST ${url}`);

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
      console.error(`[BsimClient] Error ${response.status}: ${errorText}`);
      throw new Error(`BSIM request failed: ${response.status} ${errorText}`);
    }

    return response.json() as T;
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
