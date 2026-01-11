<p align="center">
  <img src="docs/images/NSIM_LOGO.png" alt="NSIM Logo" width="250">
</p>

# NSIM - Network Simulator

Payment network middleware connecting SSIM (Store Simulator) and BSIM (Bank Simulator).

## Overview

NSIM routes payment requests from merchants (SSIM) to card issuers (BSIM), handling:
- Payment authorization with automatic expiry (7 days)
- Capture (full and partial)
- Void
- Refund (full and partial)
- Webhook notifications to merchants
- Multi-bank routing

## Tech Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js 20+ (ES Modules) |
| Language | TypeScript 5.x |
| Framework | Express.js 5.x |
| Database | PostgreSQL + Prisma ORM |
| Queue | BullMQ + Redis |
| Testing | Jest (~85% coverage) |

## Quick Start

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env and set DATABASE_URL to your PostgreSQL connection

# Setup database (creates nsim_* tables)
npx prisma generate
npx prisma db push

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
┌────────────────────────────────────────────────────────────────────┐
│                    Payment Flow (Multi-Bank)                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WSIM (Wallet) ──┐                              ┌→ BSIM (Default)  │
│                  ├──→ SSIM (Merchant) → NSIM ───┤                  │
│  Browser/App ────┘                       │      └→ NewBank BSIM    │
│                                          ↓                         │
│                              PostgreSQL (nsim_* tables)            │
│                                          ↓                         │
│                              Webhook Queue (BullMQ/Redis)          │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

### Multi-Bank Routing

NSIM supports routing payments to multiple BSIM (bank) instances. The target bank is determined from the card token:

| Token Format | Routing |
|--------------|---------|
| `wsim_bsim_xxx` | Routes to default BSIM |
| `wsim_newbank_xxx` | Routes to NewBank BSIM |
| `ctok_xxx` | Routes to default BSIM (consent flow) |
| JWT with `bsimId` claim | Routes based on claim value |

Transactions store the originating `bsimId` so subsequent operations (capture, void, refund) are routed to the correct bank.

### Payment Lifecycle

```
pending → authorized → captured → refunded
    ↓           ↓          ↓
  failed    declined    voided
              ↓
           expired (after 7 days)
```

### Webhook Events

NSIM sends webhook notifications to registered merchant endpoints when payment state changes:

| Event | Description |
|-------|-------------|
| `payment.authorized` | Funds held on customer's card |
| `payment.captured` | Payment settled to merchant |
| `payment.voided` | Authorization cancelled |
| `payment.refunded` | Funds returned to customer |
| `payment.declined` | Authorization declined by issuer |
| `payment.expired` | Authorization expired (7 days) |
| `payment.failed` | Processing error occurred |

**Webhook Signature Verification:**

All webhooks include HMAC-SHA256 signature for verification:
```
X-Webhook-Signature: sha256=<hex-encoded-hmac>
X-Webhook-Id: <unique-event-id>
X-Webhook-Timestamp: <ISO-8601-timestamp>
```

## Configuration

### Database (Required)

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | `postgresql://user:pass@host:5432/banksim` |

NSIM uses PostgreSQL with Prisma ORM. Tables use the `nsim_` prefix to allow sharing a database with BSIM:
- `nsim_payment_transactions` - Payment transaction records
- `nsim_webhook_configs` - Webhook endpoint configurations
- `nsim_webhook_deliveries` - Webhook delivery history

### Core Settings

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3006 |
| AUTH_EXPIRY_HOURS | Authorization lifetime | 168 (7 days) |
| BSIM_MAX_RETRIES | Retry attempts for BSIM calls | 3 |
| BSIM_RETRY_DELAY_MS | Base retry delay | 500 |

### BSIM Connection (Single Bank)

| Variable | Description | Default |
|----------|-------------|---------|
| BSIM_BASE_URL | Default BSIM backend URL | http://localhost:3001 |
| BSIM_API_KEY | API key for default BSIM | dev-payment-api-key |

### Multi-Bank Configuration

Add additional banks using individual environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| BSIM_NEWBANK_URL | NewBank BSIM URL | - |
| BSIM_NEWBANK_KEY | NewBank API key | dev-newbank-api-key |
| BSIM_NEWBANK_NAME | NewBank display name | New Bank |
| DEFAULT_BSIM_ID | Default bank for unknown tokens | bsim |

Or use JSON format for all providers:

```bash
BSIM_PROVIDERS='[
  {"bsimId":"bsim","name":"Bank Simulator","baseUrl":"http://backend:3001","apiKey":"xxx"},
  {"bsimId":"newbank","name":"New Bank","baseUrl":"http://newbank:3001","apiKey":"xxx"}
]'
```

### Redis & Webhooks

| Variable | Description | Default |
|----------|-------------|---------|
| REDIS_HOST | Redis host | localhost |
| REDIS_PORT | Redis port | 6379 |
| REDIS_PASSWORD | Redis password | - |
| WEBHOOK_MAX_RETRIES | Webhook delivery retries | 5 |
| WEBHOOK_RETRY_DELAY_MS | Webhook retry delay | 1000 |
| WEBHOOK_TIMEOUT_MS | Webhook delivery timeout | 10000 |

## API Specifications

NSIM provides OpenAPI and AsyncAPI specifications for integration:

| Specification | File | Description |
|---------------|------|-------------|
| **OpenAPI 3.0** | [`openapi.yaml`](openapi.yaml) | REST API endpoints (payments, webhooks, diagnostics) |
| **AsyncAPI 2.6** | [`asyncapi.yaml`](asyncapi.yaml) | Webhook event payloads and delivery format |

**View specifications:**
- OpenAPI: [Swagger Editor](https://editor.swagger.io/) - paste `openapi.yaml` contents
- AsyncAPI: [AsyncAPI Studio](https://studio.asyncapi.com/) - paste `asyncapi.yaml` contents

See [`docs/README.md`](docs/README.md) for detailed documentation on using these specs.

## Integration

NSIM provides full HTTP integration with BSIM for payment processing:

- **Authorization** - Validates card tokens and holds funds via BSIM
- **Capture** - Settles authorized payments through BSIM
- **Void** - Cancels authorizations via BSIM
- **Refund** - Returns funds through BSIM

All BSIM calls include retry logic with exponential backoff for reliability.

See [Merchant Integration Guide](docs/MERCHANT_INTEGRATION_GUIDE.md) for complete merchant integration details.

### WSIM Wallet Integration

NSIM supports wallet-initiated payments from WSIM (Wallet Simulator):

```
WSIM → BSIM (get wallet_payment_token) → SSIM → NSIM → BSIM (authorize)
```

**Supported Token Types:**
| Prefix/Type | Source | Description |
|-------------|--------|-------------|
| `ctok_` | BSIM consent flow | Standard card token from user consent |
| `wsim_bsim_` | WSIM wallet | Wallet token from default BSIM |
| `wsim_newbank_` | WSIM wallet | Wallet token from NewBank BSIM |
| `wsim_{bsimId}_` | WSIM wallet | Wallet token from any configured BSIM |
| `wallet_payment_token` | JWT type | JWT-based wallet token (5-min TTL) |

**Debugging Wallet Tokens:**
```bash
# Analyze a token without processing payment
curl -X POST http://localhost:3006/api/v1/diagnostics/analyze-token \
  -H "Content-Type: application/json" \
  -d '{"cardToken": "your-token-here"}'
```

## Testing

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # Coverage report
```

181 unit tests across 13 test suites (~85% code coverage) covering payment flows, multi-BSIM routing, webhooks, and API routes.

## Docker

```bash
docker build -t nsim .
docker run -p 3006:3006 -e DATABASE_URL="postgresql://..." nsim
```

Multi-stage build with non-root user for security. Includes Prisma client generation. Integrated into BSIM's docker-compose as `payment-network` service.

**Note:** Run `npx prisma db push` before first deployment to create database tables.

## Documentation

| Document | Description |
|----------|-------------|
| [`docs/README.md`](docs/README.md) | Documentation index and API spec guide |
| [`docs/MERCHANT_INTEGRATION_GUIDE.md`](docs/MERCHANT_INTEGRATION_GUIDE.md) | Complete merchant integration walkthrough |
| [`docs/EMBEDDED_WALLET_PAYMENT.md`](docs/EMBEDDED_WALLET_PAYMENT.md) | WSIM wallet payment flow |
| [`openapi.yaml`](openapi.yaml) | OpenAPI 3.0 specification (v1.2.0) |
| [`asyncapi.yaml`](asyncapi.yaml) | AsyncAPI 2.6 specification |
| [`CHANGELOG.md`](CHANGELOG.md) | Release notes and changes |
