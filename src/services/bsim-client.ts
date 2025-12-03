import { config } from '../config/index.js';

/**
 * Client for communicating with BSIM payment handler
 * This is a stub implementation - will be replaced with actual HTTP calls
 */

export interface BsimAuthorizationRequest {
  cardToken: string;
  amount: number;
  merchantId: string;
  merchantName: string;
  orderId: string;
}

export interface BsimAuthorizationResponse {
  approved: boolean;
  authorizationCode?: string;
  declineReason?: string;
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

  /**
   * STUB: Authorize a payment with BSIM
   * TODO: Implement actual HTTP call to BSIM payment handler
   */
  async authorize(request: BsimAuthorizationRequest): Promise<BsimAuthorizationResponse> {
    console.log('[STUB] BSIM authorize:', request);

    // Stub: Always approve for testing
    // In production, this will call BSIM's payment handler endpoint
    return {
      approved: true,
      authorizationCode: `AUTH-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };
  }

  /**
   * STUB: Capture an authorized payment
   * TODO: Implement actual HTTP call to BSIM payment handler
   */
  async capture(request: BsimCaptureRequest): Promise<BsimCaptureResponse> {
    console.log('[STUB] BSIM capture:', request);

    return { success: true };
  }

  /**
   * STUB: Void an authorization
   * TODO: Implement actual HTTP call to BSIM payment handler
   */
  async void(request: BsimVoidRequest): Promise<BsimVoidResponse> {
    console.log('[STUB] BSIM void:', request);

    return { success: true };
  }

  /**
   * STUB: Refund a captured payment
   * TODO: Implement actual HTTP call to BSIM payment handler
   */
  async refund(request: BsimRefundRequest): Promise<BsimRefundResponse> {
    console.log('[STUB] BSIM refund:', request);

    return { success: true };
  }
}
