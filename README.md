# NSIM - Network Simulator

Payment network middleware connecting SSIM (Store Simulator) and BSIM (Bank Simulator).

## Overview

NSIM routes payment requests from merchants (SSIM) to card issuers (BSIM), handling:
- Payment authorization
- Capture
- Void
- Refund

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
```

## API Endpoints

### Health
- `GET /health` - Service health check
- `GET /health/ready` - Readiness check

### Payments (v1)
- `POST /api/v1/payments/authorize` - Request payment authorization
- `POST /api/v1/payments/:transactionId/capture` - Capture authorized payment
- `POST /api/v1/payments/:transactionId/void` - Void authorization
- `POST /api/v1/payments/:transactionId/refund` - Refund captured payment
- `GET /api/v1/payments/:transactionId` - Get transaction status

## Architecture

```
SSIM (Merchant) → NSIM (Network) → BSIM (Issuer)
                       ↓
              Transaction Store
```

## Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| PORT | Server port | 3006 |
| BSIM_BASE_URL | BSIM backend URL | http://localhost:3002 |
| USE_QUEUE | Enable async queue processing | false |
| REDIS_HOST | Redis host (local) | localhost |
| AWS_SQS_QUEUE_URL | SQS queue URL (prod) | - |

## Development

This is a stub implementation for SSIM team integration. The BSIM client currently returns mock responses.
