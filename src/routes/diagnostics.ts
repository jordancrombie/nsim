import { Router, Request, Response } from 'express';
import { analyzeCardToken, TokenAnalysis } from '../services/payment.js';

const router = Router();

/**
 * POST /api/v1/diagnostics/analyze-token
 * Analyze a card token without processing a payment
 * Useful for debugging wallet payment token issues
 */
router.post('/analyze-token', (req: Request, res: Response) => {
  const { cardToken } = req.body;

  if (!cardToken || typeof cardToken !== 'string') {
    return res.status(400).json({
      error: 'Missing or invalid cardToken',
      required: ['cardToken'],
    });
  }

  const analysis = analyzeCardToken(cardToken);

  // Check for potential issues
  const warnings: string[] = [];

  if (analysis.isWalletToken) {
    warnings.push('Token identified as wallet payment token (wsim_bsim_ prefix or wallet_payment_token type)');
  }

  if (analysis.isJwt && analysis.jwtPayload) {
    // Check expiration
    const exp = analysis.jwtPayload.exp as number | undefined;
    if (exp) {
      const expiresAt = new Date(exp * 1000);
      const now = new Date();
      if (expiresAt <= now) {
        warnings.push(`Token EXPIRED at ${expiresAt.toISOString()}`);
      } else {
        const minutesRemaining = Math.round((expiresAt.getTime() - now.getTime()) / 60000);
        if (minutesRemaining < 5) {
          warnings.push(`Token expires in ${minutesRemaining} minutes`);
        }
      }
    }

    // Check token type
    if (analysis.tokenType === 'wallet_payment_token') {
      warnings.push('Token type is wallet_payment_token - verify BSIM accepts this type');
    } else if (analysis.tokenType && analysis.tokenType !== 'payment_token') {
      warnings.push(`Unexpected token type: ${analysis.tokenType}`);
    }
  }

  if (!analysis.isJwt && !analysis.prefix) {
    warnings.push('Token has no recognized prefix and is not a JWT');
  }

  // Build response with safe token preview
  const tokenPreview = cardToken.length > 20
    ? `${cardToken.substring(0, 10)}...${cardToken.substring(cardToken.length - 10)}`
    : cardToken;

  const response: {
    tokenPreview: string;
    analysis: TokenAnalysis;
    warnings: string[];
    jwtDetails?: {
      expiresAt: string | null;
      issuedAt: string | null;
      issuer: string | null;
      type: string | null;
      isExpired: boolean;
      secondsUntilExpiry: number | null;
    };
  } = {
    tokenPreview,
    analysis: {
      ...analysis,
      // Remove full JWT payload from response for security
      jwtPayload: null,
    },
    warnings,
  };

  // Add JWT details if applicable
  if (analysis.isJwt && analysis.jwtPayload) {
    const exp = analysis.jwtPayload.exp as number | undefined;
    const iat = analysis.jwtPayload.iat as number | undefined;
    const now = Date.now() / 1000;

    response.jwtDetails = {
      expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
      issuedAt: iat ? new Date(iat * 1000).toISOString() : null,
      issuer: (analysis.jwtPayload.iss as string) || null,
      type: analysis.tokenType,
      isExpired: exp ? exp <= now : false,
      secondsUntilExpiry: exp ? Math.round(exp - now) : null,
    };
  }

  res.json(response);
});

/**
 * GET /api/v1/diagnostics/token-types
 * List supported token types and prefixes
 */
router.get('/token-types', (_req: Request, res: Response) => {
  res.json({
    supportedPrefixes: [
      { prefix: 'ctok_', description: 'Standard card token from BSIM consent flow' },
      { prefix: 'wsim_bsim_', description: 'Wallet payment token from WSIM via BSIM' },
    ],
    supportedJwtTypes: [
      { type: 'payment_token', description: 'Standard payment token JWT' },
      { type: 'wallet_payment_token', description: 'Wallet payment token JWT (5-minute TTL)' },
    ],
    notes: [
      'NSIM passes all tokens to BSIM for validation',
      'Token validation errors originate from BSIM',
      'Wallet tokens have a 5-minute TTL and may expire during checkout',
    ],
  });
});

export default router;
