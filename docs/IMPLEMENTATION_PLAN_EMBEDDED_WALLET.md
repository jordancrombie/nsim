# Embedded Wallet Payment - Implementation Plan

> **Purpose:** This is the working implementation plan for the embedded wallet payment feature. Use this document to track progress, coordinate between teams, and maintain context across sessions.

## Design Reference

See [EMBEDDED_WALLET_PAYMENT.md](./EMBEDDED_WALLET_PAYMENT.md) for detailed technical design and architecture.

---

## Merchant Integration Options

The embedded wallet feature will support **three integration methods**, giving merchants flexibility to choose based on their needs:

| Method | Complexity | UX | Best For |
|--------|------------|-----|----------|
| **Popup** | Low | Good | Quick integration, works everywhere |
| **iframe** | Medium | Best | Seamless checkout experience |
| **API** | High | Custom | Full control, native apps |

**Key Principle:** All three methods will be available simultaneously. Merchants choose based on their technical capability and UX requirements.

---

## Phase 1: Popup Integration + Passkey Auth

**Goal:** Deliver a working embedded payment flow with passkey authentication.

### 1.1 WSIM: Passkey Infrastructure

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Add passkey registration UI | ⬜ Todo | WSIM | User settings page |
| Implement WebAuthn registration endpoint | ⬜ Todo | WSIM | `/api/passkey/register` |
| Store passkey credentials in DB | ⬜ Todo | WSIM | credential_id, public_key, user_id |
| Implement WebAuthn authentication endpoint | ⬜ Todo | WSIM | `/api/passkey/authenticate` |
| Add passkey login option | ⬜ Todo | WSIM | Alternative to password |

### 1.2 WSIM: Popup Card Picker

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Create `/popup/card-picker` route | ⬜ Todo | WSIM | Minimal UI, no header/footer |
| Accept query params: merchantId, amount, currency, orderId | ⬜ Todo | WSIM | For display and token request |
| Display user's linked cards | ⬜ Todo | WSIM | From BSIM card list |
| Handle unauthenticated state | ⬜ Todo | WSIM | Show passkey login or redirect |
| Implement card selection → passkey prompt | ⬜ Todo | WSIM | "Confirm $X payment to Merchant" |
| Request wallet_payment_token from BSIM after auth | ⬜ Todo | WSIM | Existing token flow |
| PostMessage token to opener window | ⬜ Todo | WSIM | `window.opener.postMessage()` |
| Close popup after successful selection | ⬜ Todo | WSIM | Auto-close |
| Handle errors and cancellation | ⬜ Todo | WSIM | PostMessage error states |

### 1.3 SSIM: Popup Integration

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Add "Pay with WSIM" button option | ⬜ Todo | SSIM | Checkout page |
| Implement popup launcher | ⬜ Todo | SSIM | `window.open()` with params |
| Add postMessage listener | ⬜ Todo | SSIM | Listen for wsim:* events |
| Handle token receipt → payment flow | ⬜ Todo | SSIM | Call NSIM authorize |
| Handle popup blocked scenario | ⬜ Todo | SSIM | Fallback to redirect |
| Handle user cancellation | ⬜ Todo | SSIM | wsim:cancelled event |

### 1.4 Documentation

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Update SSIM integration guide - popup method | ⬜ Todo | NSIM | This repo |
| Document postMessage protocol | ⬜ Todo | NSIM | Event types, payloads |
| Add popup integration code samples | ⬜ Todo | NSIM | JS/TS examples |

### Phase 1 Completion Criteria

- [ ] User can register passkey in WSIM
- [ ] User can authenticate with passkey in WSIM
- [ ] SSIM can open WSIM popup for card selection
- [ ] User can select card and authenticate with passkey
- [ ] Token flows back to SSIM via postMessage
- [ ] Payment completes successfully via NSIM

---

## Phase 2: iframe Integration

**Goal:** Enable inline card selection without popup.

### 2.1 WSIM: iframe Embed Endpoint

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Create `/embed/card-picker` route | ⬜ Todo | WSIM | Optimized for iframe |
| Configure CSP headers for allowed origins | ⬜ Todo | WSIM | X-Frame-Options, CSP |
| Create embeddable card list component | ⬜ Todo | WSIM | Responsive, minimal |
| Handle iframe-specific auth flow | ⬜ Todo | WSIM | Session cookies in iframe |
| Test passkey in iframe context | ⬜ Todo | WSIM | Requires `allow` attribute |
| PostMessage to parent window | ⬜ Todo | WSIM | `window.parent.postMessage()` |
| Add origin validation | ⬜ Todo | WSIM | Only post to allowed origins |

### 2.2 SSIM: iframe Integration

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Add iframe container component | ⬜ Todo | SSIM | Styled container |
| Set iframe `allow` attribute for passkeys | ⬜ Todo | SSIM | `publickey-credentials-get` |
| Handle iframe load states | ⬜ Todo | SSIM | Loading, error, ready |
| Resize iframe based on content | ⬜ Todo | SSIM | postMessage height updates |

### 2.3 Documentation

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Update SSIM integration guide - iframe method | ⬜ Todo | NSIM | This repo |
| Document CSP requirements | ⬜ Todo | NSIM | For merchant sites |
| Add iframe integration code samples | ⬜ Todo | NSIM | HTML/JS examples |

### Phase 2 Completion Criteria

- [ ] SSIM can embed WSIM card picker in iframe
- [ ] Passkey authentication works within iframe
- [ ] Token flows via postMessage to parent
- [ ] iframe resizes appropriately
- [ ] Works alongside popup option (merchant choice)

---

## Phase 3: API Integration

**Goal:** Enable merchants to build fully custom UIs.

### 3.1 WSIM: Card List API

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Create `/api/wallet/cards` endpoint | ⬜ Todo | WSIM | Returns user's cards |
| Implement merchant API authentication | ⬜ Todo | WSIM | API key or OAuth |
| Add user context passing | ⬜ Todo | WSIM | User token from merchant |
| Rate limiting and security | ⬜ Todo | WSIM | Prevent abuse |

### 3.2 WSIM: Payment Token API

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Create `/api/wallet/payment-token` endpoint | ⬜ Todo | WSIM | Request token for card |
| Require passkey authentication | ⬜ Todo | WSIM | Challenge-response in API |
| Return wallet_payment_token | ⬜ Todo | WSIM | Same format as other methods |

### 3.3 Documentation

| Task | Status | Owner | Notes |
|------|--------|-------|-------|
| Update SSIM integration guide - API method | ⬜ Todo | NSIM | This repo |
| Document API authentication | ⬜ Todo | NSIM | OAuth flow or API keys |
| Add API integration code samples | ⬜ Todo | NSIM | cURL, JS, Python |
| OpenAPI spec for wallet APIs | ⬜ Todo | WSIM | Machine-readable |

### Phase 3 Completion Criteria

- [ ] Merchant can fetch user's card list via API
- [ ] Merchant can request payment token for selected card
- [ ] Passkey authentication integrated into API flow
- [ ] Works alongside popup and iframe options

---

## PostMessage Protocol

All integration methods use the same postMessage protocol for consistency:

### Events from WSIM → Merchant

```typescript
// Card selected, token ready
interface WsimCardSelected {
  type: 'wsim:card-selected';
  token: string;           // wallet_payment_token JWT
  cardLast4: string;       // "4242"
  cardBrand: string;       // "visa", "mastercard", etc.
  expiresAt: string;       // ISO timestamp (5 min from now)
}

// User cancelled selection
interface WsimCancelled {
  type: 'wsim:cancelled';
  reason: 'user' | 'timeout' | 'error';
}

// Authentication required (not logged in)
interface WsimAuthRequired {
  type: 'wsim:auth-required';
  message: string;
}

// Error occurred
interface WsimError {
  type: 'wsim:error';
  code: string;            // "passkey_failed", "token_error", etc.
  message: string;
}

// iframe height changed (iframe only)
interface WsimResize {
  type: 'wsim:resize';
  height: number;          // pixels
}
```

### Events from Merchant → WSIM (iframe only)

```typescript
// Initialize with payment details
interface MerchantInit {
  type: 'merchant:init';
  merchantId: string;
  merchantName: string;
  amount: number;
  currency: string;
  orderId: string;
}
```

---

## Merchant SDK (Future)

To simplify integration, we may provide a JavaScript SDK:

```javascript
// Future: @banksim/wsim-checkout SDK
import { WsimCheckout } from '@banksim/wsim-checkout';

const checkout = new WsimCheckout({
  merchantId: 'merchant-123',
  mode: 'popup',  // or 'iframe' or 'api'
  onToken: (token) => {
    // Send to your backend → NSIM
  },
  onCancel: () => {
    // Handle cancellation
  },
  onError: (error) => {
    // Handle error
  }
});

// Trigger checkout
checkout.open({
  amount: 104.99,
  currency: 'CAD',
  orderId: 'order-456'
});
```

---

## Testing Checklist

### Integration Testing

- [ ] Popup flow: SSIM → WSIM popup → passkey → token → NSIM → BSIM
- [ ] iframe flow: SSIM → WSIM iframe → passkey → token → NSIM → BSIM
- [ ] API flow: SSIM → WSIM API → passkey → token → NSIM → BSIM
- [ ] Token expiry handling (5 min TTL)
- [ ] Passkey registration and authentication
- [ ] Multiple cards selection
- [ ] Error scenarios (network, auth failure, cancelled)

### Browser Testing

- [ ] Chrome (desktop + mobile)
- [ ] Safari (desktop + iOS)
- [ ] Firefox
- [ ] Edge
- [ ] Passkey support in each browser

### Security Testing

- [ ] Origin validation on postMessage
- [ ] CSP headers preventing unauthorized embedding
- [ ] Token cannot be replayed
- [ ] Passkey bound to correct origin

---

## Dependencies

| Component | Depends On | Notes |
|-----------|------------|-------|
| WSIM Popup | WSIM Passkey | Must complete passkey first |
| WSIM iframe | WSIM Popup | Popup validates the flow |
| WSIM API | WSIM iframe | API is last phase |
| SSIM Popup | WSIM Popup | Needs WSIM endpoint ready |
| SSIM iframe | WSIM iframe | Needs WSIM endpoint ready |

---

## Open Questions

1. **Passkey fallback:** What if user's device doesn't support passkeys? Password fallback? Magic link?

2. **Multi-device:** How do passkeys sync across user's devices? (Platform-dependent)

3. **Session duration:** How long is WSIM session valid in iframe/popup before re-auth needed?

4. **Merchant onboarding:** Do merchants need to register allowed origins for iframe embedding?

5. **SDK packaging:** NPM package? CDN script? Both?

---

## Change Log

| Date | Change | Author |
|------|--------|--------|
| 2024-12-05 | Initial plan created | Claude |

---

## Related Documents

- [EMBEDDED_WALLET_PAYMENT.md](./EMBEDDED_WALLET_PAYMENT.md) - Technical design
- [../SSIM_INTEGRATION_GUIDE.md](../SSIM_INTEGRATION_GUIDE.md) - Merchant integration guide
- [../TODO.md](../TODO.md) - Project roadmap
