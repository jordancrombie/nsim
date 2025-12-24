import { describe, it, expect, beforeEach } from '@jest/globals';

// We need to test the token extraction logic since the registry itself
// is a singleton with static configuration. Test the extraction functions.

describe('BSIM Token Routing', () => {
  // Import analyzeCardToken from the payment service
  let analyzeCardToken: (token: string) => {
    prefix: string | null;
    bsimId: string | null;
    isJwt: boolean;
    jwtPayload: Record<string, unknown> | null;
    tokenType: string | null;
    isWalletToken: boolean;
    rawLength: number;
  };

  beforeEach(async () => {
    const paymentModule = await import('../../services/payment.js');
    analyzeCardToken = paymentModule.analyzeCardToken;
  });

  describe('analyzeCardToken - bsimId extraction', () => {
    it('should extract bsimId from wsim_bsim_ token', () => {
      const analysis = analyzeCardToken('wsim_bsim_abc123def456');

      expect(analysis.bsimId).toBe('bsim');
      expect(analysis.prefix).toBe('wsim_bsim_');
      expect(analysis.isWalletToken).toBe(true);
    });

    it('should extract bsimId from wsim_newbank_ token', () => {
      const analysis = analyzeCardToken('wsim_newbank_652eb18344a9');

      expect(analysis.bsimId).toBe('newbank');
      expect(analysis.prefix).toBe('wsim_newbank_');
      expect(analysis.isWalletToken).toBe(true);
    });

    it('should extract bsimId from wsim_otherbank_ token', () => {
      const analysis = analyzeCardToken('wsim_otherbank_xyz789');

      expect(analysis.bsimId).toBe('otherbank');
      expect(analysis.prefix).toBe('wsim_otherbank_');
      expect(analysis.isWalletToken).toBe(true);
    });

    it('should not set bsimId for ctok_ tokens', () => {
      const analysis = analyzeCardToken('ctok_valid_token_123');

      expect(analysis.bsimId).toBeNull();
      // The prefix regex matches all lowercase chars and underscores before the first non-match
      expect(analysis.prefix).toBe('ctok_valid_token_');
      expect(analysis.isWalletToken).toBe(false);
    });

    it('should extract bsimId from JWT with bsimId claim', () => {
      // Create a JWT with bsimId in payload
      const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          type: 'wallet_payment_token',
          bsimId: 'newbank',
          sub: 'user-123',
          exp: Math.floor(Date.now() / 1000) + 300,
        })
      ).toString('base64');
      const signature = 'fake-signature';
      const jwt = `${header}.${payload}.${signature}`;

      const analysis = analyzeCardToken(jwt);

      expect(analysis.bsimId).toBe('newbank');
      expect(analysis.isJwt).toBe(true);
      expect(analysis.tokenType).toBe('wallet_payment_token');
      expect(analysis.isWalletToken).toBe(true);
    });

    it('should prefer prefix bsimId over JWT bsimId', () => {
      // Token with wsim_newbank_ prefix AND JWT format
      // The prefix should take precedence
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ bsimId: 'bsim' })).toString('base64');
      const signature = 'fake';

      // This is a contrived example - in reality the prefix wouldn't be on a JWT
      const token = `wsim_newbank_${header}.${payload}.${signature}`;

      const analysis = analyzeCardToken(token);

      // The wsim_newbank_ prefix should be detected
      expect(analysis.bsimId).toBe('newbank');
      expect(analysis.isWalletToken).toBe(true);
    });

    it('should handle tokens without bsimId', () => {
      const analysis = analyzeCardToken('random_token_format_xyz');

      expect(analysis.bsimId).toBeNull();
      // The prefix regex matches all lowercase chars and underscores
      expect(analysis.prefix).toBe('random_token_format_');
      expect(analysis.isWalletToken).toBe(false);
    });

    it('should handle empty token', () => {
      const analysis = analyzeCardToken('');

      expect(analysis.bsimId).toBeNull();
      expect(analysis.prefix).toBeNull();
      expect(analysis.rawLength).toBe(0);
    });

    it('should handle numeric bsimId in token', () => {
      const analysis = analyzeCardToken('wsim_bank123_tokendata');

      expect(analysis.bsimId).toBe('bank123');
      expect(analysis.prefix).toBe('wsim_bank123_');
      expect(analysis.isWalletToken).toBe(true);
    });
  });

  describe('Token format validation', () => {
    it('should correctly identify wallet tokens by prefix', () => {
      const walletTokens = [
        'wsim_bsim_abc123',
        'wsim_newbank_def456',
        'wsim_bank2_xyz789',
      ];

      for (const token of walletTokens) {
        const analysis = analyzeCardToken(token);
        expect(analysis.isWalletToken).toBe(true);
        expect(analysis.bsimId).not.toBeNull();
      }
    });

    it('should correctly identify non-wallet tokens', () => {
      const nonWalletTokens = [
        'ctok_abc123',
        'tok_xyz789',
        'plain_token',
      ];

      for (const token of nonWalletTokens) {
        const analysis = analyzeCardToken(token);
        // ctok_ and other tokens are not wallet tokens unless JWT says so
        if (!token.startsWith('wsim_')) {
          expect(analysis.bsimId).toBeNull();
        }
      }
    });
  });
});
