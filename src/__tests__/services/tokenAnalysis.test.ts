import { describe, it, expect } from '@jest/globals';
import { analyzeCardToken } from '../../services/payment.js';

describe('analyzeCardToken', () => {
  describe('prefix detection', () => {
    it('should detect ctok_ prefix', () => {
      const result = analyzeCardToken('ctok_abc123');
      expect(result.prefix).toBe('ctok_');
      expect(result.isWalletToken).toBe(false);
    });

    it('should detect wsim_bsim_ prefix as wallet token', () => {
      const result = analyzeCardToken('wsim_bsim_abc123');
      expect(result.prefix).toBe('wsim_bsim_');
      expect(result.isWalletToken).toBe(true);
    });

    it('should return null prefix for tokens without prefix', () => {
      const result = analyzeCardToken('abc123');
      expect(result.prefix).toBeNull();
    });
  });

  describe('JWT detection', () => {
    it('should detect JWT format', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ type: 'payment_token' })).toString('base64');
      const signature = 'sig';
      const jwt = `${header}.${payload}.${signature}`;

      const result = analyzeCardToken(jwt);
      expect(result.isJwt).toBe(true);
      expect(result.tokenType).toBe('payment_token');
    });

    it('should identify wallet_payment_token type', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ type: 'wallet_payment_token' })).toString('base64');
      const signature = 'sig';
      const jwt = `${header}.${payload}.${signature}`;

      const result = analyzeCardToken(jwt);
      expect(result.isJwt).toBe(true);
      expect(result.tokenType).toBe('wallet_payment_token');
      expect(result.isWalletToken).toBe(true);
    });

    it('should extract JWT payload claims', () => {
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
      const payload = Buffer.from(
        JSON.stringify({
          type: 'payment_token',
          iss: 'bsim',
          exp: 1234567890,
          iat: 1234567800,
          customClaim: 'value',
        })
      ).toString('base64');
      const signature = 'sig';
      const jwt = `${header}.${payload}.${signature}`;

      const result = analyzeCardToken(jwt);
      expect(result.jwtPayload).not.toBeNull();
      expect(result.jwtPayload?.type).toBe('payment_token');
      expect(result.jwtPayload?.iss).toBe('bsim');
      expect(result.jwtPayload?.exp).toBe(1234567890);
      expect(result.jwtPayload?.customClaim).toBe('value');
    });

    it('should handle invalid JWT payload gracefully', () => {
      const jwt = 'header.invalid-base64-payload.signature';

      const result = analyzeCardToken(jwt);
      expect(result.isJwt).toBe(true); // Has 3 parts
      expect(result.jwtPayload).toBeNull(); // But couldn't decode
      expect(result.tokenType).toBeNull();
    });

    it('should not detect non-JWT as JWT', () => {
      const result = analyzeCardToken('ctok_abc123');
      expect(result.isJwt).toBe(false);
      expect(result.jwtPayload).toBeNull();
    });

    it('should not detect 2-part string as JWT', () => {
      const result = analyzeCardToken('part1.part2');
      expect(result.isJwt).toBe(false);
    });
  });

  describe('raw length', () => {
    it('should return the correct raw length', () => {
      const token = 'ctok_abc123';
      const result = analyzeCardToken(token);
      expect(result.rawLength).toBe(token.length);
    });

    it('should return length for long tokens', () => {
      const token = 'ctok_' + 'a'.repeat(1000);
      const result = analyzeCardToken(token);
      expect(result.rawLength).toBe(1005);
    });
  });

  describe('combined prefix and JWT', () => {
    it('should detect both prefix and JWT characteristics', () => {
      // A token that starts with a prefix but is also a valid JWT structure
      // This is an edge case - in practice, JWTs don't have these prefixes
      const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64');
      const payload = Buffer.from(JSON.stringify({ type: 'payment_token' })).toString('base64');
      const signature = 'sig';
      const jwt = `${header}.${payload}.${signature}`;

      const result = analyzeCardToken(jwt);
      // JWT detection should work
      expect(result.isJwt).toBe(true);
      // No prefix since JWT doesn't start with known prefix pattern
      expect(result.prefix).toBeNull();
    });
  });
});
