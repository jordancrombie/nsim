# Merchant Integration Guide

This guide provides comprehensive documentation for merchants integrating with NSIM (Network SIM) - a payment network middleware that routes transactions between merchants and card issuers.

## Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Authentication](#authentication)
4. [Payment API](#payment-api)
5. [Webhooks](#webhooks)
6. [WSIM Wallet Integration](#wsim-wallet-integration)
7. [Error Handling](#error-handling)
8. [Testing](#testing)
9. [TypeScript Interfaces](#typescript-interfaces)

---

## Overview

NSIM acts as a payment gateway between:
- **Merchants (SSIM)**: E-commerce platforms, retail POS systems, etc.
- **Card Issuers (BSIM)**: Banks that issue payment cards to consumers
- **Wallet Providers (WSIM)**: Digital wallets that store card credentials

### Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Merchant   │────▶│     NSIM     │────▶│  Card Issuer │
│    (SSIM)    │◀────│   Gateway    │◀────│    (BSIM)    │
└──────────────┘     └──────────────┘     └──────────────┘
                            │
                            ▼
                     ┌──────────────┐
                     │   Digital    │
                     │   Wallet     │
                     │   (WSIM)     │
                     └──────────────┘
```

---

## Prerequisites

Before integrating, you'll need:

1. **Merchant Account**: Register with your NSIM provider to receive credentials
2. **API Key**: For authenticating payment requests
3. **Client Credentials**: For OAuth-based card token acquisition
4. **Webhook Endpoint**: To receive transaction notifications

### Credentials You'll Receive

| Credential | Purpose | Example Format |
|------------|---------|----------------|
| `client_id` | OAuth client identifier | `your-merchant-id` |
| `client_secret` | OAuth client secret | `your-client-secret` |
| `api_key` | Payment API authentication | `your-api-key` |
| `webhook_secret` | Webhook signature verification | `your-webhook-secret` |

---

## Authentication

### OAuth Token Flow

To acquire a card token for payments, use the OAuth consent flow:

```typescript
// Step 1: Redirect user to authorization endpoint
const authUrl = new URL('https://your-wallet-provider.com/interaction/authorize');
authUrl.searchParams.set('client_id', 'your-merchant-id');
authUrl.searchParams.set('redirect_uri', 'https://your-store.com/callback');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('scope', 'card_token');
authUrl.searchParams.set('state', 'random-state-value');

// Redirect user
window.location.href = authUrl.toString();
```

```typescript
// Step 2: Handle callback and exchange code for token
const response = await fetch('https://your-wallet-provider.com/api/bsim/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    grant_type: 'authorization_code',
    code: authorizationCode,
    client_id: 'your-merchant-id',
    client_secret: 'your-client-secret',
    redirect_uri: 'https://your-store.com/callback'
  })
});

const { card_token } = await response.json();
// Use card_token for payment authorization
```

### API Key Authentication

For payment API requests, include your API key in the header:

```typescript
const response = await fetch('https://nsim-gateway.example.com/api/payments/authorize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify(paymentRequest)
});
```

---

## Payment API

### Authorization

Request authorization for a payment amount:

```typescript
const authRequest = {
  cardToken: 'ctok_abc123...',  // From OAuth flow
  amount: 10499,                 // Amount in cents ($104.99)
  currency: 'USD',
  merchantId: 'your-merchant-id',
  orderId: 'order-12345'
};

const response = await fetch('https://nsim-gateway.example.com/api/payments/authorize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify(authRequest)
});

const { transactionId, status, authCode } = await response.json();
```

**Response:**
```json
{
  "transactionId": "txn_789xyz",
  "status": "authorized",
  "authCode": "AUTH123",
  "authorizedAmount": 10499,
  "currency": "USD"
}
```

### Capture

Capture an authorized payment (full or partial):

```typescript
// Full capture
const captureResponse = await fetch(
  `https://nsim-gateway.example.com/api/payments/${transactionId}/capture`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key'
    },
    body: JSON.stringify({
      amount: 10499  // Full amount, or less for partial capture
    })
  }
);
```

### Void

Cancel an authorized but uncaptured payment:

```typescript
const voidResponse = await fetch(
  `https://nsim-gateway.example.com/api/payments/${transactionId}/void`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key'
    }
  }
);
```

### Refund

Refund a captured payment (full or partial):

```typescript
const refundResponse = await fetch(
  `https://nsim-gateway.example.com/api/payments/${transactionId}/refund`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': 'your-api-key'
    },
    body: JSON.stringify({
      amount: 5000  // Partial refund of $50.00
    })
  }
);
```

---

## Webhooks

### Setup

Register a webhook endpoint to receive transaction notifications:

```typescript
const webhookConfig = {
  url: 'https://your-store.com/webhooks/nsim',
  events: ['payment.authorized', 'payment.captured', 'payment.voided', 'payment.refunded'],
  secret: 'your-webhook-secret'
};

await fetch('https://nsim-gateway.example.com/api/webhooks', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify(webhookConfig)
});
```

### Event Types

| Event | Description |
|-------|-------------|
| `payment.authorized` | Payment authorization approved |
| `payment.declined` | Payment authorization declined |
| `payment.captured` | Payment captured successfully |
| `payment.voided` | Authorization voided |
| `payment.refunded` | Refund processed |

### Signature Verification

Verify webhook authenticity using HMAC-SHA256:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler
app.post('/webhooks/nsim', (req, res) => {
  const signature = req.headers['x-nsim-signature'] as string;
  const payload = JSON.stringify(req.body);

  if (!verifyWebhookSignature(payload, signature, 'your-webhook-secret')) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Process webhook event
  const { event, data } = req.body;
  // ...
});
```

### Webhook Payload Example

```json
{
  "event": "payment.captured",
  "timestamp": "2024-12-07T10:30:00Z",
  "data": {
    "transactionId": "txn_789xyz",
    "status": "captured",
    "amount": 10499,
    "currency": "USD",
    "merchantId": "your-merchant-id",
    "orderId": "order-12345"
  }
}
```

---

## WSIM Wallet Integration

For digital wallet payments, NSIM supports wallet payment tokens from WSIM-compatible wallet providers.

### Wallet Payment Flow

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│ Customer │────▶│ Merchant │────▶│   NSIM   │────▶│  Issuer  │
│          │     │  (SSIM)  │     │          │     │  (BSIM)  │
└──────────┘     └──────────┘     └──────────┘     └──────────┘
     │                                  │
     │           ┌──────────┐           │
     └──────────▶│  Wallet  │◀──────────┘
                 │  (WSIM)  │
                 └──────────┘
```

### Using Wallet Payment Tokens

Wallet tokens can be used in place of card tokens:

```typescript
const authRequest = {
  cardToken: 'eyJhbGciOiJIUzI1NiIs...',  // wallet_payment_token JWT
  amount: 10499,
  currency: 'USD',
  merchantId: 'your-merchant-id',
  orderId: 'order-12345'
};

// NSIM automatically detects and validates wallet payment tokens
const response = await fetch('https://nsim-gateway.example.com/api/payments/authorize', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': 'your-api-key'
  },
  body: JSON.stringify(authRequest)
});
```

### Token Formats

NSIM supports multiple token formats:

| Format | Prefix/Pattern | Description |
|--------|----------------|-------------|
| Card Token | `ctok_` | Direct card token from OAuth flow |
| Wallet JWT | `eyJ...` (JWT) | Wallet payment token containing card reference |
| Prefixed Token | `wsim_bsim_` | Legacy wallet-issued token |

### Embedded Wallet Integration

For seamless checkout experiences, see the [Embedded Wallet Payment](./EMBEDDED_WALLET_PAYMENT.md) documentation for:
- iframe integration
- Popup integration
- API-first integration

---

## Error Handling

### Error Response Format

```json
{
  "error": {
    "code": "INVALID_TOKEN",
    "message": "The provided card token is invalid or expired",
    "details": {
      "field": "cardToken"
    }
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_TOKEN` | 400 | Card token is invalid or expired |
| `INSUFFICIENT_FUNDS` | 402 | Card has insufficient funds |
| `CARD_DECLINED` | 402 | Card was declined by issuer |
| `INVALID_AMOUNT` | 400 | Amount is invalid or exceeds limits |
| `TRANSACTION_NOT_FOUND` | 404 | Transaction ID not found |
| `INVALID_STATE` | 409 | Transaction is in invalid state for operation |
| `AUTHENTICATION_FAILED` | 401 | API key is invalid |
| `RATE_LIMITED` | 429 | Too many requests |

### Retry Logic

For transient failures (5xx errors), implement exponential backoff:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelay = 1000
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;

      const delay = baseDelay * Math.pow(2, attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
```

---

## Testing

### Test Environment

Use the test environment for development:

| Environment | Base URL |
|-------------|----------|
| Test | `https://nsim-test.example.com` |
| Production | `https://nsim.example.com` |

### Test Cards

| Card Number | Behavior |
|-------------|----------|
| `4111111111111111` | Always approves |
| `4000000000000002` | Always declines |
| `4000000000000069` | Triggers expired card error |
| `4000000000000127` | Triggers insufficient funds |

### Test API Keys

Request test credentials from your NSIM provider. Test credentials work only against the test environment.

---

## TypeScript Interfaces

```typescript
// Payment Request
interface AuthorizationRequest {
  cardToken: string;
  amount: number;          // Amount in cents
  currency: string;        // ISO 4217 currency code
  merchantId: string;
  orderId: string;
  metadata?: Record<string, string>;
}

// Payment Response
interface AuthorizationResponse {
  transactionId: string;
  status: 'authorized' | 'declined' | 'error';
  authCode?: string;
  authorizedAmount: number;
  currency: string;
  declineReason?: string;
}

// Capture Request
interface CaptureRequest {
  amount?: number;  // Omit for full capture
}

// Refund Request
interface RefundRequest {
  amount?: number;  // Omit for full refund
  reason?: string;
}

// Transaction Status
interface Transaction {
  transactionId: string;
  status: 'authorized' | 'captured' | 'voided' | 'refunded' | 'partially_refunded';
  authorizedAmount: number;
  capturedAmount: number;
  refundedAmount: number;
  currency: string;
  merchantId: string;
  orderId: string;
  createdAt: string;
  updatedAt: string;
}

// Webhook Event
interface WebhookEvent {
  event: string;
  timestamp: string;
  data: Transaction;
}

// Webhook Configuration
interface WebhookConfig {
  id?: string;
  url: string;
  events: string[];
  secret: string;
  active?: boolean;
}
```

---

## SDK Libraries

Official SDK libraries (coming soon):
- `@nsim/sdk-node` - Node.js/TypeScript
- `@nsim/sdk-python` - Python
- `@nsim/sdk-go` - Go

---

## Support

For integration support:
- Review the [API Reference](./API_REFERENCE.md) (coming soon)
- Check the [FAQ](./FAQ.md) (coming soon)
- Contact your NSIM provider's support team

---

## Related Documentation

- [Embedded Wallet Payment](./EMBEDDED_WALLET_PAYMENT.md) - Embedded checkout options
- [Implementation Plan](./IMPLEMENTATION_PLAN_EMBEDDED_WALLET.md) - Embedded wallet implementation phases
