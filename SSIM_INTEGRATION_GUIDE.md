# SSIM Payment Integration Guide

This guide explains how to integrate SSIM (Store Simulator) with the NSIM Payment Network to accept card payments from BSIM customers.

## Quick Start - Dev Environment

**Your SSIM OAuth credentials are already configured:**

| Setting | Value |
|---------|-------|
| Client ID | `ssim-client` |
| Client Secret | `ece9c837b17bface1df34fe89d8c8e13bcf4f9e77c7a7681442952ebd9dd7015` |
| Auth URL | `https://auth-dev.banksim.ca` |
| Payment API URL | `https://payment-dev.banksim.ca` |
| Redirect URIs | `https://ssim-dev.banksim.ca/auth/callback/bsim`, `http://localhost:3005/auth/callback/bsim` |

**Dev vs Production URLs:**

| Service | Dev URL | Production URL |
|---------|---------|----------------|
| Auth Server | `https://auth-dev.banksim.ca` | `https://auth.banksim.ca` |
| Payment Network | `https://payment-dev.banksim.ca` | `https://payment.banksim.ca` |
| SSIM | `https://ssim-dev.banksim.ca` | `https://ssim.banksim.ca` |

## Overview

The payment flow involves three systems:
1. **SSIM** (Your store) - Initiates payment requests
2. **NSIM** (Payment Network) - Routes payments between merchants and banks
3. **BSIM** (Bank) - Authorizes and processes payments

```
Customer → SSIM Checkout → OAuth Consent (BSIM) → NSIM API → BSIM Processing
              ↓                    ↓                 ↓            ↓
         Order created      Card selected      Payment routed   Authorized
              ↓                    ↓                 ↓            ↓
         Redirect         card_token issued   Transaction ID   Response
```

## Prerequisites

1. Register as an OAuth client with BSIM (contact BSIM admin)
2. Obtain your `client_id` and `client_secret`
3. Configure your redirect URI(s)

## Step 1: OAuth Payment Authorization

When a customer wants to pay, redirect them to BSIM's authorization endpoint to select their card.

### Authorization Request

```
GET https://auth-dev.banksim.ca/auth
  ?client_id=ssim-client
  &redirect_uri=https://ssim-dev.banksim.ca/auth/callback/bsim
  &response_type=code
  &scope=openid payment:authorize
  &state=order_12345
```

**Parameters:**
- `client_id` - Your registered client ID (`ssim-client` for dev)
- `redirect_uri` - Where to redirect after authorization
- `response_type` - Must be `code`
- `scope` - Must include `payment:authorize`
- `state` - Your order ID or session identifier (returned in callback)

### User Experience

1. User is redirected to BSIM login
2. User authenticates (passkey or password)
3. User sees payment consent screen with their credit cards
4. User selects a card and clicks "Authorize Payment"
5. User is redirected back to your `redirect_uri`

### Authorization Callback

```
GET https://ssim-dev.banksim.ca/auth/callback/bsim
  ?code=AUTHORIZATION_CODE
  &state=order_12345
```

### Token Exchange

Exchange the authorization code for an access token:

```http
POST https://auth-dev.banksim.ca/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://ssim-dev.banksim.ca/auth/callback/bsim
&client_id=ssim-client
&client_secret=ece9c837b17bface1df34fe89d8c8e13bcf4f9e77c7a7681442952ebd9dd7015
```

**Response:**
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIs...",
  "token_type": "Bearer",
  "expires_in": 3600,
  "scope": "openid payment:authorize"
}
```

### Extract Card Token

Decode the JWT access token to get the `card_token` claim:

```javascript
const jwt = require('jsonwebtoken');
const decoded = jwt.decode(accessToken);
const cardToken = decoded.card_token;  // e.g., "ctok_a1b2c3d4e5f6..."
```

## Step 2: Submit Payment to NSIM

Use the card token to authorize a payment through the NSIM Payment Network.

### Authorization Request

```http
POST https://payment-dev.banksim.ca/api/v1/payments/authorize
Content-Type: application/json
X-API-Key: dev-payment-api-key

{
  "merchantId": "ssim-client",
  "merchantName": "SSIM Store",
  "amount": 99.99,
  "currency": "CAD",
  "cardToken": "ctok_a1b2c3d4e5f6...",
  "orderId": "order_12345",
  "description": "Online purchase"
}
```

**Response (Success):**
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "authorized",
  "authorizationCode": "AUTH-ABC12345",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

**Response (Declined):**
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "declined",
  "declineReason": "Insufficient credit",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Step 3: Capture Payment

After shipping the order or completing the service, capture the authorized payment:

```http
POST https://payment-dev.banksim.ca/api/v1/payments/{transactionId}/capture
Content-Type: application/json
X-API-Key: dev-payment-api-key

{
  "amount": 99.99
}
```

**Note:** You can capture a partial amount if needed.

**Response:**
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "captured",
  "capturedAmount": 99.99,
  "timestamp": "2024-01-15T14:30:00Z"
}
```

## Step 4: Refunds (If Needed)

To refund a captured payment:

```http
POST https://payment-dev.banksim.ca/api/v1/payments/{transactionId}/refund
Content-Type: application/json
X-API-Key: dev-payment-api-key

{
  "amount": 99.99,
  "reason": "Customer return"
}
```

**Response:**
```json
{
  "transactionId": "550e8400-e29b-41d4-a716-446655440000",
  "refundId": "660e8400-e29b-41d4-a716-446655440001",
  "status": "refunded",
  "refundedAmount": 99.99,
  "timestamp": "2024-01-16T10:00:00Z"
}
```

## Step 5: Void Authorization (If Needed)

To cancel an authorization before capture (e.g., order cancelled):

```http
POST https://payment-dev.banksim.ca/api/v1/payments/{transactionId}/void
Content-Type: application/json
X-API-Key: dev-payment-api-key

{
  "reason": "Customer cancelled order"
}
```

## Check Transaction Status

```http
GET https://payment-dev.banksim.ca/api/v1/payments/{transactionId}
X-API-Key: dev-payment-api-key
```

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "merchantId": "YOUR_CLIENT_ID",
  "merchantName": "SSIM Store",
  "orderId": "order_12345",
  "amount": 99.99,
  "currency": "CAD",
  "status": "captured",
  "authorizationCode": "AUTH-ABC12345",
  "capturedAmount": 99.99,
  "refundedAmount": 0,
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T14:30:00Z"
}
```

## Payment Statuses

| Status | Description |
|--------|-------------|
| `pending` | Payment request received, processing |
| `authorized` | Card charged, funds held |
| `captured` | Payment settled to merchant |
| `voided` | Authorization cancelled, funds released |
| `refunded` | Payment returned to customer |
| `declined` | Authorization denied by bank |
| `expired` | Authorization expired (7 days) |
| `failed` | Processing error |

## TypeScript Interface

Here's a suggested interface for your SSIM integration:

```typescript
// ssim/src/payment/types.ts

export interface PaymentRequest {
  amount: number;
  currency: string;
  orderId: string;
  description?: string;
}

export interface PaymentResponse {
  transactionId: string;
  status: 'pending' | 'authorized' | 'captured' | 'voided' | 'refunded' | 'declined' | 'expired' | 'failed';
  authorizationCode?: string;
  declineReason?: string;
  capturedAmount?: number;
  refundedAmount?: number;
  timestamp: string;
}

export interface IPaymentNetworkAdapter {
  /**
   * Submit a payment for authorization
   * @param cardToken - Token from OAuth consent flow
   * @param request - Payment details
   */
  submitPayment(cardToken: string, request: PaymentRequest): Promise<PaymentResponse>;

  /**
   * Capture an authorized payment
   */
  capturePayment(transactionId: string, amount?: number): Promise<PaymentResponse>;

  /**
   * Refund a captured payment
   */
  refundPayment(transactionId: string, amount: number, reason?: string): Promise<PaymentResponse>;

  /**
   * Void an authorization
   */
  voidPayment(transactionId: string, reason?: string): Promise<PaymentResponse>;

  /**
   * Get transaction status
   */
  getTransaction(transactionId: string): Promise<PaymentResponse>;
}
```

## Example Implementation

```typescript
// ssim/src/payment/SimNetAdapter.ts

export class SimNetAdapter implements IPaymentNetworkAdapter {
  private baseUrl = 'https://payment-dev.banksim.ca/api/v1';  // Use payment.banksim.ca for production
  private apiKey: string;
  private merchantId: string;

  constructor(merchantId: string, apiKey: string) {
    this.merchantId = merchantId;
    this.apiKey = apiKey;
  }

  async submitPayment(cardToken: string, request: PaymentRequest): Promise<PaymentResponse> {
    const response = await fetch(`${this.baseUrl}/payments/authorize`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({
        merchantId: this.merchantId,
        merchantName: 'SSIM Store',
        cardToken,
        ...request,
      }),
    });

    return response.json();
  }

  async capturePayment(transactionId: string, amount?: number): Promise<PaymentResponse> {
    const response = await fetch(`${this.baseUrl}/payments/${transactionId}/capture`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify({ amount }),
    });

    return response.json();
  }

  // ... implement other methods
}
```

## Environment Variables

Add these to your SSIM `.env`:

```env
# OAuth (BSIM Auth Server) - DEV
OAUTH_CLIENT_ID=ssim-client
OAUTH_CLIENT_SECRET=ece9c837b17bface1df34fe89d8c8e13bcf4f9e77c7a7681442952ebd9dd7015
OAUTH_AUTH_URL=https://auth-dev.banksim.ca
OAUTH_TOKEN_URL=https://auth-dev.banksim.ca/token

# Payment Network (NSIM) - DEV
PAYMENT_NETWORK_URL=https://payment-dev.banksim.ca
PAYMENT_API_KEY=dev-payment-api-key
```

## Testing

### Local Development

1. Start BSIM with docker-compose (includes auth-server, backend)
2. Start NSIM: `cd nsim && npm run dev`
3. Update your hosts file or use the dev URLs

### Test Cards

BSIM users can create credit cards with various credit limits for testing different scenarios:
- Create a card with low credit limit to test "Insufficient credit" declines
- Create multiple cards to test card selection

## Error Handling

Always check the `status` field in responses:

```typescript
const response = await paymentAdapter.submitPayment(cardToken, request);

switch (response.status) {
  case 'authorized':
    // Store transactionId, show success
    break;
  case 'declined':
    // Show decline reason to customer
    console.log('Declined:', response.declineReason);
    break;
  case 'failed':
    // Log error, show generic error to customer
    break;
}
```

## Webhooks (NEW)

Register webhooks to receive real-time notifications about payment events. This eliminates the need to poll for transaction status.

### Register a Webhook

```http
POST https://payment-dev.banksim.ca/api/v1/webhooks
Content-Type: application/json
X-API-Key: dev-payment-api-key

{
  "merchantId": "ssim-client",
  "url": "https://ssim-dev.banksim.ca/webhooks/payment",
  "events": ["payment.authorized", "payment.captured", "payment.refunded", "payment.declined", "payment.expired"]
}
```

**Response:**
```json
{
  "id": "webhook-uuid",
  "merchantId": "ssim-client",
  "url": "https://ssim-dev.banksim.ca/webhooks/payment",
  "events": ["payment.authorized", "payment.captured", "payment.refunded", "payment.declined", "payment.expired"],
  "secret": "your-webhook-secret-for-signature-verification",
  "createdAt": "2024-12-03T10:00:00Z"
}
```

**Important:** Save the `secret` - you'll need it to verify webhook signatures.

### Webhook Events

| Event | Description |
|-------|-------------|
| `payment.authorized` | Payment authorized, funds held |
| `payment.captured` | Payment captured/settled |
| `payment.voided` | Authorization voided |
| `payment.refunded` | Payment refunded |
| `payment.declined` | Payment declined |
| `payment.expired` | Authorization expired (7 days) |
| `payment.failed` | Payment processing failed |

### Webhook Payload

```json
{
  "id": "webhook-delivery-uuid",
  "event": "payment.authorized",
  "timestamp": "2024-12-03T10:30:00Z",
  "data": {
    "transactionId": "550e8400-e29b-41d4-a716-446655440000",
    "merchantId": "ssim-client",
    "orderId": "order_12345",
    "amount": 99.99,
    "currency": "CAD",
    "status": "authorized",
    "authorizationCode": "AUTH-ABC12345"
  }
}
```

### Verify Webhook Signatures

All webhooks include an HMAC-SHA256 signature in the `X-Webhook-Signature` header:

```typescript
import crypto from 'crypto';

function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

// In your webhook handler:
app.post('/webhooks/payment', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'] as string;
  const webhookId = req.headers['x-webhook-id'] as string;
  const payload = req.body.toString();

  if (!verifyWebhookSignature(payload, signature, process.env.WEBHOOK_SECRET!)) {
    return res.status(401).json({ error: 'Invalid signature' });
  }

  const event = JSON.parse(payload);

  switch (event.event) {
    case 'payment.authorized':
      // Update order status
      break;
    case 'payment.captured':
      // Mark order as paid
      break;
    // ... handle other events
  }

  res.status(200).json({ received: true });
});
```

### Webhook Management

**List webhooks:**
```http
GET https://payment-dev.banksim.ca/api/v1/webhooks/merchant/ssim-client
X-API-Key: dev-payment-api-key
```

**Update webhook:**
```http
PATCH https://payment-dev.banksim.ca/api/v1/webhooks/{webhookId}
Content-Type: application/json
X-API-Key: dev-payment-api-key

{
  "url": "https://new-url.example.com/webhooks",
  "events": ["payment.authorized", "payment.captured"],
  "isActive": true
}
```

**Delete webhook:**
```http
DELETE https://payment-dev.banksim.ca/api/v1/webhooks/{webhookId}
X-API-Key: dev-payment-api-key
```

### Webhook Retry Policy

- Webhooks are retried up to 5 times on failure
- Exponential backoff: 1s, 2s, 4s, 8s, 16s
- Timeout: 10 seconds per delivery attempt
- A successful delivery is any 2xx response

## WSIM Wallet Integration (Coming Soon)

In addition to the OAuth consent flow, SSIM can integrate with WSIM (Wallet Simulator) to offer customers a faster checkout experience using their saved wallet payment methods.

### Integration Options

Merchants can choose their preferred integration method based on UX requirements and technical capability:

| Method | Complexity | UX Quality | Description |
|--------|------------|------------|-------------|
| **Popup** | Low | Good | Opens WSIM in popup window for card selection |
| **iframe** | Medium | Best | Embeds card picker inline in checkout page |
| **API** | High | Custom | Fetch cards via API, build your own UI |

All methods result in a `wallet_payment_token` that you submit to NSIM exactly like a standard `card_token`.

### Popup Integration (Recommended Starting Point)

```javascript
// 1. Open WSIM popup when user clicks "Pay with WSIM"
function openWsimCheckout(amount, orderId) {
  const params = new URLSearchParams({
    merchantId: 'ssim-client',
    merchantName: 'SSIM Store',
    amount: amount.toString(),
    currency: 'CAD',
    orderId: orderId
  });

  const popup = window.open(
    `https://wsim-auth-dev.banksim.ca/popup/card-picker?${params}`,
    'wsim-payment',
    'width=420,height=620,scrollbars=yes'
  );

  // Handle popup blocked
  if (!popup) {
    alert('Please allow popups to pay with WSIM');
    return;
  }
}

// 2. Listen for token from WSIM
window.addEventListener('message', async (event) => {
  // Verify origin
  if (event.origin !== 'https://wsim-auth-dev.banksim.ca') return;

  switch (event.data.type) {
    case 'wsim:card-selected':
      // User selected card and authenticated with passkey
      const { token, cardLast4, cardBrand } = event.data;
      console.log(`Payment authorized with ${cardBrand} ****${cardLast4}`);

      // Submit to your backend → NSIM
      await submitPayment(token, amount, orderId);
      break;

    case 'wsim:cancelled':
      // User closed popup or cancelled
      console.log('Payment cancelled:', event.data.reason);
      break;

    case 'wsim:error':
      // Error occurred
      console.error('WSIM error:', event.data.code, event.data.message);
      break;
  }
});

// 3. Submit payment to NSIM (same as OAuth flow)
async function submitPayment(cardToken, amount, orderId) {
  const response = await fetch('/api/checkout/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cardToken, amount, orderId })
  });
  // cardToken is the wallet_payment_token from WSIM
  // Your backend calls NSIM authorize endpoint as usual
}
```

### iframe Integration (Better UX)

```html
<!-- Embed WSIM card picker in your checkout page -->
<div id="wsim-container">
  <iframe
    id="wsim-frame"
    src="https://wsim-auth-dev.banksim.ca/embed/card-picker?merchantId=ssim-client&amount=99.99"
    allow="publickey-credentials-get *"
    style="width: 100%; border: none; min-height: 300px;"
  ></iframe>
</div>

<script>
// Handle iframe resize
window.addEventListener('message', (event) => {
  if (event.origin !== 'https://wsim-auth-dev.banksim.ca') return;

  if (event.data.type === 'wsim:resize') {
    document.getElementById('wsim-frame').style.height = event.data.height + 'px';
  }

  if (event.data.type === 'wsim:card-selected') {
    submitPayment(event.data.token, amount, orderId);
  }
});
</script>
```

**Note:** The `allow="publickey-credentials-get *"` attribute is required for passkey authentication to work within the iframe.

### API Integration (Advanced)

For merchants who want full control over the UI:

```typescript
// 1. Get user's cards (requires user authentication with WSIM)
const cardsResponse = await fetch('https://wsim-auth-dev.banksim.ca/api/wallet/cards', {
  headers: {
    'Authorization': `Bearer ${wsimUserToken}`,
    'X-Merchant-Id': 'ssim-client'
  }
});
const { cards } = await cardsResponse.json();
// cards = [{ id, last4, brand, expiryMonth, expiryYear }, ...]

// 2. Render your own card picker UI
// ...

// 3. Request payment token for selected card
const tokenResponse = await fetch('https://wsim-auth-dev.banksim.ca/api/wallet/payment-token', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${wsimUserToken}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    cardId: selectedCard.id,
    amount: 99.99,
    currency: 'CAD',
    merchantId: 'ssim-client',
    orderId: 'order_12345'
  })
});
// This will trigger passkey authentication on the user's device
const { token } = await tokenResponse.json();

// 4. Submit to NSIM
await submitPayment(token, amount, orderId);
```

### PostMessage Event Reference

All integration methods use the same event protocol:

| Event | Direction | Description |
|-------|-----------|-------------|
| `wsim:card-selected` | WSIM → Merchant | Card selected, contains `token`, `cardLast4`, `cardBrand` |
| `wsim:cancelled` | WSIM → Merchant | User cancelled, contains `reason` |
| `wsim:error` | WSIM → Merchant | Error occurred, contains `code`, `message` |
| `wsim:auth-required` | WSIM → Merchant | User not logged in, contains `message` |
| `wsim:resize` | WSIM → Merchant | iframe content height changed (iframe only) |

### Passkey Authentication

WSIM uses passkey (WebAuthn) authentication for payment confirmation:

1. User selects a card in WSIM
2. WSIM displays: "Confirm payment of $99.99 to SSIM Store"
3. User authenticates with Face ID / Touch ID / Windows Hello
4. On success, `wallet_payment_token` is issued and sent to merchant

This provides strong authentication without passwords and prevents unauthorized payments.

### WSIM URLs

| Environment | Popup URL | iframe URL |
|-------------|-----------|------------|
| Development | `https://wsim-auth-dev.banksim.ca/popup/card-picker` | `https://wsim-auth-dev.banksim.ca/embed/card-picker` |
| Production | `https://wsim-auth.banksim.ca/popup/card-picker` | `https://wsim-auth.banksim.ca/embed/card-picker` |

### Implementation Status

See [docs/IMPLEMENTATION_PLAN_EMBEDDED_WALLET.md](docs/IMPLEMENTATION_PLAN_EMBEDDED_WALLET.md) for current implementation status and roadmap.

## Security Notes

1. **Never expose your `client_secret` or `apiKey` in frontend code**
2. **Store card tokens temporarily** - they expire in 24 hours
3. **Always use HTTPS** in production
4. **Always validate webhook signatures** - use the secret returned when you registered the webhook
5. **Validate postMessage origins** - always check `event.origin` before processing WSIM events
6. **Wallet tokens expire in 5 minutes** - submit payment immediately after receiving token

## Support

For questions or issues:
- BSIM repo: https://github.com/jordancrombie/bsim
- NSIM repo: https://github.com/jordancrombie/nsim

## API Reference

Full OpenAPI specification available at:
- Local: http://localhost:3006/docs (coming soon)
- File: [nsim/openapi.yaml](openapi.yaml)
