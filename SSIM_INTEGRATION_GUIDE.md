# SSIM Payment Integration Guide

This guide explains how to integrate SSIM (Store Simulator) with the NSIM Payment Network to accept card payments from BSIM customers.

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
GET https://auth.banksim.ca/auth
  ?client_id=YOUR_CLIENT_ID
  &redirect_uri=https://ssim.banksim.ca/payment/callback
  &response_type=code
  &scope=openid payment:authorize
  &state=order_12345
```

**Parameters:**
- `client_id` - Your registered client ID
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
GET https://ssim.banksim.ca/payment/callback
  ?code=AUTHORIZATION_CODE
  &state=order_12345
```

### Token Exchange

Exchange the authorization code for an access token:

```http
POST https://auth.banksim.ca/token
Content-Type: application/x-www-form-urlencoded

grant_type=authorization_code
&code=AUTHORIZATION_CODE
&redirect_uri=https://ssim.banksim.ca/payment/callback
&client_id=YOUR_CLIENT_ID
&client_secret=YOUR_CLIENT_SECRET
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
POST https://payment.banksim.ca/api/v1/payments/authorize
Content-Type: application/json
X-API-Key: YOUR_MERCHANT_API_KEY

{
  "merchantId": "YOUR_CLIENT_ID",
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
POST https://payment.banksim.ca/api/v1/payments/{transactionId}/capture
Content-Type: application/json
X-API-Key: YOUR_MERCHANT_API_KEY

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
POST https://payment.banksim.ca/api/v1/payments/{transactionId}/refund
Content-Type: application/json
X-API-Key: YOUR_MERCHANT_API_KEY

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
POST https://payment.banksim.ca/api/v1/payments/{transactionId}/void
Content-Type: application/json
X-API-Key: YOUR_MERCHANT_API_KEY

{
  "reason": "Customer cancelled order"
}
```

## Check Transaction Status

```http
GET https://payment.banksim.ca/api/v1/payments/{transactionId}
X-API-Key: YOUR_MERCHANT_API_KEY
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
  private baseUrl = 'https://payment.banksim.ca/api/v1';
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
# OAuth (BSIM Auth Server)
OAUTH_CLIENT_ID=ssim-store
OAUTH_CLIENT_SECRET=your-client-secret
OAUTH_AUTH_URL=https://auth.banksim.ca
OAUTH_TOKEN_URL=https://auth.banksim.ca/token

# Payment Network (NSIM)
PAYMENT_NETWORK_URL=https://payment.banksim.ca
PAYMENT_API_KEY=your-merchant-api-key
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

## Security Notes

1. **Never expose your `client_secret` or `apiKey` in frontend code**
2. **Store card tokens temporarily** - they expire in 24 hours
3. **Always use HTTPS** in production
4. **Validate webhook signatures** (when implemented)

## Support

For questions or issues:
- BSIM repo: https://github.com/jordancrombie/bsim
- NSIM repo: https://github.com/jordancrombie/nsim

## API Reference

Full OpenAPI specification available at:
- Local: http://localhost:3006/docs (coming soon)
- File: [nsim/openapi.yaml](openapi.yaml)
