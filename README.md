# NSIM - Network Simulator

Payment network middleware connecting SSIM (Store Simulator) and BSIM (Bank Simulator).

## Overview

NSIM routes payment requests from merchants (SSIM) to card issuers (BSIM), handling:
- Payment authorization with automatic expiry
- Capture (full and partial)
- Void
- Refund (full and partial)
- Webhook notifications to merchants

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env

# Run in development
npm run dev

# Build for production
npm run build
npm start

# Run tests
npm test
```

## API Endpoints

### Health
- `GET /health` - Service health check
- `GET /health/ready` - Readiness check with dependency status

### Payments (v1)
- `POST /api/v1/payments/authorize` - Request payment authorization
- `POST /api/v1/payments/:transactionId/capture` - Capture authorized payment
- `POST /api/v1/payments/:transactionId/void` - Void authorization
- `POST /api/v1/payments/:transactionId/refund` - Refund captured payment
- `GET /api/v1/payments/:transactionId` - Get transaction status

### Webhooks (v1)
- `POST /api/v1/webhooks` - Register webhook endpoint
- `GET /api/v1/webhooks/merchant/:merchantId` - List merchant webhooks
- `PATCH /api/v1/webhooks/:id` - Update webhook
- `DELETE /api/v1/webhooks/:id` - Delete webhook

### Diagnostics (v1)
- `POST /api/v1/diagnostics/analyze-token` - Analyze card token (for debugging)
- `GET /api/v1/diagnostics/token-types` - List supported token formats

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Payment Flow                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  WSIM (Wallet) ──┐                                           │
│                  ├──→ SSIM (Merchant) → NSIM → BSIM (Issuer) │
│  Browser/App ────┘                       │                   │
│                                          ↓                   │
│                                 Transaction Store            │
│                                          ↓                   │
│                              Webhook Queue (BullMQ/Redis)    │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Payment Lifecycle

```
pending → authorized → captured → refunded
    ↓           ↓          ↓
  failed    declined    voided
              ↓
           expired (after 7 days)
```

### Webhook Events

- `payment.authorized` - Payment authorized, funds held
- `payment.captured` - Payment settled to merchant
- `payment.voided` - Authorization cancelled
- `payment.refunded` - Payment refunded to customer
- `payment.declined` - Payment declined by issuer
- `payment.expired` - Authorization expired
- `payment.failed` - Processing error

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3006 |
| BSIM_BASE_URL | BSIM backend URL | http://localhost:3002 |
| BSIM_API_KEY | API key for BSIM authentication | - |
| BSIM_MAX_RETRIES | Retry attempts for BSIM calls | 3 |
| BSIM_RETRY_DELAY_MS | Base retry delay | 500 |
| AUTH_EXPIRY_HOURS | Authorization lifetime | 168 (7 days) |
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| REDIS_PASSWORD | Redis password | - |
| WEBHOOK_MAX_RETRIES | Webhook delivery retries | 5 |
| WEBHOOK_RETRY_DELAY_MS | Webhook retry delay | 1000 |
| WEBHOOK_TIMEOUT_MS | Webhook delivery timeout | 10000 |

## Integration

NSIM provides full HTTP integration with BSIM for payment processing:

- **Authorization** - Validates card tokens and holds funds via BSIM
- **Capture** - Settles authorized payments through BSIM
- **Void** - Cancels authorizations via BSIM
- **Refund** - Returns funds through BSIM

All BSIM calls include retry logic with exponential backoff for reliability.

See [SSIM_INTEGRATION_GUIDE.md](SSIM_INTEGRATION_GUIDE.md) for merchant integration details.

### WSIM Wallet Integration

NSIM supports wallet-initiated payments from WSIM (Wallet Simulator):

```
WSIM → BSIM (get wallet_payment_token) → SSIM → NSIM → BSIM (authorize)
```

**Supported Token Types:**
| Prefix/Type | Source | Description |
|-------------|--------|-------------|
| `ctok_` | BSIM consent flow | Standard card token from user consent |
| `wsim_bsim_` | WSIM wallet | Wallet payment token prefix |
| `wallet_payment_token` | JWT type | JWT-based wallet token (5-min TTL) |
| `payment_token` | JWT type | Standard payment token |

**Token Flow:**
1. User initiates payment in WSIM wallet
2. WSIM requests `wallet_payment_token` JWT from BSIM
3. WSIM passes token to SSIM merchant
4. SSIM sends authorization request to NSIM
5. NSIM forwards token to BSIM for validation and authorization
6. BSIM validates JWT signature, expiry, and card status

**Debugging Wallet Tokens:**
```bash
# Analyze a token without processing payment
curl -X POST http://localhost:3006/api/v1/diagnostics/analyze-token \
  -H "Content-Type: application/json" \
  -d '{"cardToken": "your-token-here"}'
```

Returns token analysis including prefix, JWT claims, expiry status, and warnings.

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

172 unit tests across 12 test suites (~84% code coverage) covering payment flows, BSIM client, webhooks, and API routes.

## Docker

```bash
docker build -t nsim .
docker run -p 3006:3006 nsim
```

Multi-stage build with non-root user for security. Integrated into BSIM's docker-compose as `payment-network` service.
