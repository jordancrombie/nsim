/**
 * BSIM Provider Registry
 *
 * Manages multiple BSIM (Bank Simulator) instances for multi-bank payment routing.
 * Each BSIM instance represents a separate bank that can issue cards and process payments.
 *
 * Token Format: wsim_{bsimId}_{hash}
 * Example: wsim_newbank_652eb18344a9 → routes to NewBank BSIM instance
 */

import { config, BsimProvider } from '../config/index.js';

class BsimRegistry {
  private providers: Map<string, BsimProvider>;
  private defaultBsimId: string;

  constructor() {
    this.providers = new Map();
    this.defaultBsimId = config.defaultBsimId;

    // Load providers from config
    for (const provider of config.bsimProviders) {
      this.providers.set(provider.bsimId, provider);
    }

    console.log(
      `[BsimRegistry] Initialized with ${this.providers.size} provider(s):`,
      Array.from(this.providers.keys()).join(', ')
    );
  }

  /**
   * Get a BSIM provider by ID
   * @param bsimId - The BSIM instance identifier (e.g., 'bsim', 'newbank')
   * @returns The provider config or undefined if not found
   */
  getProvider(bsimId: string): BsimProvider | undefined {
    return this.providers.get(bsimId);
  }

  /**
   * Get the default BSIM provider
   * Used for tokens without a bsimId prefix (e.g., ctok_ tokens)
   */
  getDefaultProvider(): BsimProvider | undefined {
    return this.providers.get(this.defaultBsimId);
  }

  /**
   * Get a provider for a given token, extracting bsimId from the token prefix
   * Token formats:
   *   - wsim_{bsimId}_{hash} → extracts bsimId from second segment
   *   - ctok_{...} → uses default provider
   *   - JWT tokens → uses default provider
   *
   * @param cardToken - The card token to analyze
   * @returns The provider and extracted bsimId
   */
  getProviderForToken(cardToken: string): { provider: BsimProvider | undefined; bsimId: string } {
    const bsimId = this.extractBsimIdFromToken(cardToken);
    const provider = this.getProvider(bsimId) || this.getDefaultProvider();

    return { provider, bsimId };
  }

  /**
   * Extract bsimId from a card token
   * Supports: wsim_{bsimId}_{hash} format
   *
   * @param cardToken - The card token
   * @returns The extracted bsimId or default
   */
  extractBsimIdFromToken(cardToken: string): string {
    // Pattern: wsim_{bsimId}_{hash}
    // Example: wsim_newbank_652eb18344a9
    const wsimMatch = cardToken.match(/^wsim_([a-z0-9]+)_/);
    if (wsimMatch) {
      return wsimMatch[1];
    }

    // ctok_ tokens are from the default BSIM (consent flow)
    if (cardToken.startsWith('ctok_')) {
      return this.defaultBsimId;
    }

    // JWT tokens - check for bsimId in payload if possible
    if (cardToken.includes('.')) {
      try {
        const parts = cardToken.split('.');
        if (parts.length === 3) {
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          if (payload.bsimId) {
            return payload.bsimId;
          }
        }
      } catch {
        // Invalid JWT, use default
      }
    }

    return this.defaultBsimId;
  }

  /**
   * List all registered providers
   */
  listProviders(): BsimProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Check if a bsimId is registered
   */
  hasProvider(bsimId: string): boolean {
    return this.providers.has(bsimId);
  }

  /**
   * Get provider count
   */
  get providerCount(): number {
    return this.providers.size;
  }
}

// Singleton instance
export const bsimRegistry = new BsimRegistry();
