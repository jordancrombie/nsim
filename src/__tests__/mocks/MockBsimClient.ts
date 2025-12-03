import {
  BsimAuthorizationRequest,
  BsimAuthorizationResponse,
  BsimCaptureRequest,
  BsimCaptureResponse,
  BsimVoidRequest,
  BsimVoidResponse,
  BsimRefundRequest,
  BsimRefundResponse,
} from '../../services/bsim-client';

/**
 * Mock BSIM client for testing
 * Simulates BSIM payment handler responses without HTTP calls
 */
export class MockBsimClient {
  // Store for tracking calls and controlling responses
  private authorizationResponses: Map<string, BsimAuthorizationResponse> = new Map();
  private validTokens: Set<string> = new Set();
  private authorizations: Map<string, { amount: number; captured: boolean; voided: boolean }> = new Map();

  // Call tracking
  public authorizeCalls: BsimAuthorizationRequest[] = [];
  public captureCalls: BsimCaptureRequest[] = [];
  public voidCalls: BsimVoidRequest[] = [];
  public refundCalls: BsimRefundRequest[] = [];
  public validateTokenCalls: string[] = [];

  // Configuration
  public shouldFailNetwork = false;
  public networkErrorMessage = 'Network error';

  constructor() {
    // Set up some default valid tokens
    this.validTokens.add('ctok_valid_token_123');
    this.validTokens.add('ctok_test_token_456');
  }

  /**
   * Add a valid card token
   */
  addValidToken(token: string): void {
    this.validTokens.add(token);
  }

  /**
   * Set a pre-configured response for a specific token
   */
  setAuthorizationResponse(cardToken: string, response: BsimAuthorizationResponse): void {
    this.authorizationResponses.set(cardToken, response);
  }

  /**
   * Clear all state
   */
  clear(): void {
    this.authorizationResponses.clear();
    this.validTokens.clear();
    this.authorizations.clear();
    this.authorizeCalls = [];
    this.captureCalls = [];
    this.voidCalls = [];
    this.refundCalls = [];
    this.validateTokenCalls = [];
    this.shouldFailNetwork = false;
    // Re-add default tokens
    this.validTokens.add('ctok_valid_token_123');
    this.validTokens.add('ctok_test_token_456');
  }

  async authorize(request: BsimAuthorizationRequest): Promise<BsimAuthorizationResponse> {
    this.authorizeCalls.push(request);

    if (this.shouldFailNetwork) {
      throw new Error(this.networkErrorMessage);
    }

    // Check for pre-configured response
    const preConfigured = this.authorizationResponses.get(request.cardToken);
    if (preConfigured) {
      if (preConfigured.approved && preConfigured.authorizationCode) {
        this.authorizations.set(preConfigured.authorizationCode, {
          amount: request.amount,
          captured: false,
          voided: false,
        });
      }
      return preConfigured;
    }

    // Check if token is valid
    if (!this.validTokens.has(request.cardToken)) {
      return {
        approved: false,
        declineReason: 'Invalid card token',
      };
    }

    // Generate authorization code
    const authorizationCode = `AUTH-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Store authorization for capture/void
    this.authorizations.set(authorizationCode, {
      amount: request.amount,
      captured: false,
      voided: false,
    });

    return {
      approved: true,
      authorizationCode,
      availableCredit: 10000 - request.amount,
    };
  }

  async capture(request: BsimCaptureRequest): Promise<BsimCaptureResponse> {
    this.captureCalls.push(request);

    if (this.shouldFailNetwork) {
      throw new Error(this.networkErrorMessage);
    }

    const auth = this.authorizations.get(request.authorizationCode);
    if (!auth) {
      return {
        success: false,
        error: 'Authorization not found',
      };
    }

    if (auth.captured) {
      return {
        success: false,
        error: 'Authorization already captured',
      };
    }

    if (auth.voided) {
      return {
        success: false,
        error: 'Authorization was voided',
      };
    }

    if (request.amount > auth.amount) {
      return {
        success: false,
        error: 'Capture amount exceeds authorization',
      };
    }

    auth.captured = true;
    return { success: true };
  }

  async void(request: BsimVoidRequest): Promise<BsimVoidResponse> {
    this.voidCalls.push(request);

    if (this.shouldFailNetwork) {
      throw new Error(this.networkErrorMessage);
    }

    const auth = this.authorizations.get(request.authorizationCode);
    if (!auth) {
      return {
        success: false,
        error: 'Authorization not found',
      };
    }

    if (auth.captured) {
      return {
        success: false,
        error: 'Cannot void captured authorization',
      };
    }

    if (auth.voided) {
      return {
        success: false,
        error: 'Authorization already voided',
      };
    }

    auth.voided = true;
    return { success: true };
  }

  async refund(request: BsimRefundRequest): Promise<BsimRefundResponse> {
    this.refundCalls.push(request);

    if (this.shouldFailNetwork) {
      throw new Error(this.networkErrorMessage);
    }

    const auth = this.authorizations.get(request.authorizationCode);
    if (!auth) {
      return {
        success: false,
        error: 'Authorization not found',
      };
    }

    if (!auth.captured) {
      return {
        success: false,
        error: 'Cannot refund uncaptured authorization',
      };
    }

    if (request.amount > auth.amount) {
      return {
        success: false,
        error: 'Refund amount exceeds captured amount',
      };
    }

    return { success: true };
  }

  async validateToken(cardToken: string): Promise<boolean> {
    this.validateTokenCalls.push(cardToken);

    if (this.shouldFailNetwork) {
      throw new Error(this.networkErrorMessage);
    }

    return this.validTokens.has(cardToken);
  }
}
