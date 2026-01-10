# NSIM Documentation

This directory contains documentation and guides for integrating with NSIM.

## API Specifications

NSIM provides two specification files for different integration patterns:

### OpenAPI Specification (`openapi.yaml`)

**Location:** `/openapi.yaml` (project root)

**Purpose:** Describes the REST API that merchants (SSIMs) call to process payments.

**Use this when:**
- Integrating payment processing (authorize, capture, void, refund)
- Registering and managing webhooks
- Debugging with token analysis endpoints
- Generating API clients in any language

**Key endpoints:**
| Endpoint | Description |
|----------|-------------|
| `POST /payments/authorize` | Request payment authorization |
| `POST /payments/{id}/capture` | Capture authorized payment |
| `POST /payments/{id}/void` | Void authorization |
| `POST /payments/{id}/refund` | Refund captured payment |
| `POST /webhooks` | Register webhook endpoint |
| `POST /diagnostics/analyze-token` | Debug card tokens |

**Tools:**
- View in [Swagger Editor](https://editor.swagger.io/)
- Generate clients with [OpenAPI Generator](https://openapi-generator.tech/)

---

### AsyncAPI Specification (`asyncapi.yaml`)

**Location:** `/asyncapi.yaml` (project root)

**Purpose:** Describes the webhook events that NSIM sends to merchants asynchronously.

**Use this when:**
- Implementing a webhook receiver endpoint
- Understanding webhook payload structure
- Verifying webhook signatures
- Handling payment lifecycle events

**Key events:**
| Event | Description |
|-------|-------------|
| `payment.authorized` | Funds held on customer's card |
| `payment.captured` | Payment settled to merchant |
| `payment.voided` | Authorization cancelled |
| `payment.refunded` | Funds returned to customer |
| `payment.declined` | Authorization declined by issuer |
| `payment.expired` | Authorization expired (7 days) |
| `payment.failed` | Processing error occurred |

**Webhook headers:**
```
X-Webhook-Signature: sha256=<hmac-hex>
X-Webhook-Id: <event-uuid>
X-Webhook-Timestamp: <iso-8601>
```

**Tools:**
- View in [AsyncAPI Studio](https://studio.asyncapi.com/)
- Generate docs with [AsyncAPI Generator](https://www.asyncapi.com/tools/generator)

---

## OpenAPI vs AsyncAPI - When to Use Which

| Aspect | OpenAPI | AsyncAPI |
|--------|---------|----------|
| **Direction** | You call NSIM | NSIM calls you |
| **Pattern** | Request/Response | Event-driven |
| **Protocol** | HTTP REST | HTTP POST (webhooks) |
| **Use case** | Payment operations | Event notifications |

**Integration flow:**
```
┌─────────┐  OpenAPI   ┌──────┐  AsyncAPI  ┌─────────┐
│  SSIM   │ ────────→  │ NSIM │ ─────────→ │  SSIM   │
│(client) │  REST API  │      │  Webhooks  │(server) │
└─────────┘            └──────┘            └─────────┘
```

## Other Documentation

| Document | Description |
|----------|-------------|
| [MERCHANT_INTEGRATION_GUIDE.md](MERCHANT_INTEGRATION_GUIDE.md) | Complete merchant integration walkthrough |
| [EMBEDDED_WALLET_PAYMENT.md](EMBEDDED_WALLET_PAYMENT.md) | WSIM wallet payment flow |

## Keeping Specs Updated

When making changes to NSIM APIs:
1. Update `openapi.yaml` for REST endpoint changes
2. Update `asyncapi.yaml` for webhook payload changes
3. Bump the version number in the spec
4. Update this README if adding new endpoints/events
