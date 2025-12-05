# Embedded Wallet Payment Feature

## Overview

This document explores options for embedding the WSIM wallet card selection experience directly within SSIM (merchant) checkout, rather than redirecting users to the WSIM application.

## Current Flow (Redirect)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Current: Full Redirect Flow                                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User clicks "Pay with WSIM" on SSIM checkout                        │
│                         │                                               │
│                         ▼                                               │
│  2. Redirect to WSIM: wsim-auth-dev.banksim.ca/interaction/...          │
│                         │                                               │
│                         ▼                                               │
│  3. User logs into WSIM (if needed)                                     │
│                         │                                               │
│                         ▼                                               │
│  4. User selects payment card from wallet                               │
│                         │                                               │
│                         ▼                                               │
│  5. WSIM gets wallet_payment_token from BSIM                            │
│                         │                                               │
│                         ▼                                               │
│  6. Redirect back to SSIM with token                                    │
│                         │                                               │
│                         ▼                                               │
│  7. SSIM completes payment via NSIM → BSIM                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Drawbacks:**
- User leaves merchant context (jarring UX)
- Multiple page loads and redirects
- Login friction if not already authenticated
- User may abandon checkout during redirect

---

## Proposed: Embedded Payment Flow

### Option A: iframe with Dedicated Embed Endpoint

```
┌─────────────────────────────────────────────────────────────────────────┐
│ SSIM Checkout Page                                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   Order Summary                                                         │
│   ─────────────                                                         │
│   Product: Widget Pro          $99.99                                   │
│   Shipping:                     $5.00                                   │
│   ───────────────────────────────────                                   │
│   Total:                      $104.99                                   │
│                                                                         │
│   ┌───────────────────────────────────────────────────────────────┐     │
│   │  Pay with WSIM Wallet                                         │     │
│   │  ─────────────────────────────────────────────────────────    │     │
│   │  ┌─────────────────────────────────────────────────────────┐  │     │
│   │  │ 💳 Visa •••• 4242                              [Select] │  │     │
│   │  ├─────────────────────────────────────────────────────────┤  │     │
│   │  │ 💳 Mastercard •••• 5555                        [Select] │  │     │
│   │  ├─────────────────────────────────────────────────────────┤  │     │
│   │  │ 💳 Amex •••• 1234                              [Select] │  │     │
│   │  └─────────────────────────────────────────────────────────┘  │     │
│   │                                        ↑                      │     │
│   │                              WSIM iframe content              │     │
│   └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Implementation:**

1. **WSIM: New `/embed/card-picker` endpoint**
   - Minimal UI designed for iframe embedding
   - Returns card list for authenticated user
   - Handles "not logged in" state gracefully
   - CSP headers allow embedding from SSIM origins

2. **SSIM: Embed iframe on checkout**
   ```html
   <iframe
     src="https://wsim-auth-dev.banksim.ca/embed/card-picker?merchantId=...&amount=104.99"
     allow="publickey-credentials-get"
   ></iframe>
   ```

3. **Communication via postMessage**
   ```javascript
   // WSIM (in iframe) - after card selection
   window.parent.postMessage({
     type: 'wsim:card-selected',
     token: 'eyJhbGciOiJIUzI1NiIs...',  // wallet_payment_token
     cardLast4: '4242',
     cardBrand: 'visa'
   }, 'https://ssim.example.com');

   // SSIM (parent window) - listener
   window.addEventListener('message', (event) => {
     if (event.origin !== 'https://wsim-auth-dev.banksim.ca') return;
     if (event.data.type === 'wsim:card-selected') {
       processPayment(event.data.token);
     }
   });
   ```

**Pros:**
- User stays in merchant context
- Faster checkout experience
- Familiar pattern (Apple Pay, Google Pay)

**Cons:**
- Requires WSIM changes for embed endpoint
- iframe security considerations
- Cross-origin authentication complexity

---

### Option B: Popup Window

Similar to PayPal's classic flow - opens a small popup window for card selection.

```javascript
// SSIM: Open popup
const popup = window.open(
  'https://wsim-auth-dev.banksim.ca/popup/card-picker?merchantId=...&amount=104.99',
  'wsim-payment',
  'width=400,height=600'
);

// WSIM (in popup) - after selection
window.opener.postMessage({
  type: 'wsim:card-selected',
  token: '...'
}, 'https://ssim.example.com');
window.close();
```

**Pros:**
- Avoids iframe CSP complexity
- Full WSIM authentication flow available
- Works well with passkeys (see below)

**Cons:**
- Popup blockers may interfere
- Less integrated feel than iframe

---

### Option C: API-First (SSIM Renders UI)

SSIM fetches card list via API and renders its own UI.

```
SSIM → WSIM API: GET /api/wallet/cards (with user auth token)
WSIM → SSIM: [{ cardId, last4, brand, ... }]
User selects card in SSIM-rendered UI
SSIM → WSIM API: POST /api/wallet/payment-token { cardId, amount }
WSIM → SSIM: { token: 'wallet_payment_token...' }
SSIM → NSIM: authorize with token
```

**Pros:**
- Full control over UI
- No iframe/popup complexity
- Best performance

**Cons:**
- Requires WSIM API changes
- SSIM needs to handle WSIM authentication
- More integration work
- Authentication is outside WSIM's control

---

## Passkey Authentication Integration

### Why Passkeys?

Passkeys provide:
- **Phishing-resistant authentication** - Bound to specific origin
- **No passwords** - Biometric or device PIN
- **Fast UX** - Single gesture (Face ID, Touch ID, Windows Hello)
- **Transaction binding** - Can sign specific payment details

### Passkey-Enhanced Embedded Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Passkey-Authenticated Embedded Payment                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. User clicks "Pay with WSIM" on SSIM                                 │
│                         │                                               │
│                         ▼                                               │
│  2. SSIM loads WSIM iframe/popup with payment details                   │
│     (amount, merchant, order reference)                                 │
│                         │                                               │
│                         ▼                                               │
│  3. WSIM checks if user has active session                              │
│     ├── YES: Show card list immediately                                 │
│     └── NO: Show "Sign in with Passkey" button                          │
│                         │                                               │
│                         ▼                                               │
│  4. User selects payment card                                           │
│                         │                                               │
│                         ▼                                               │
│  5. WSIM prompts: "Authenticate to pay $104.99 to SSIM Store"           │
│                         │                                               │
│                         ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    🔐 Passkey Prompt                            │    │
│  │                                                                 │    │
│  │    Confirm payment of $104.99 to SSIM Store                     │    │
│  │                                                                 │    │
│  │              [Touch ID / Face ID / Windows Hello]               │    │
│  │                                                                 │    │
│  │    Using passkey for: wsim-auth-dev.banksim.ca                  │    │
│  │                                                                 │    │
│  └─────────────────────────────────────────────────────────────────┘    │
│                         │                                               │
│                         ▼                                               │
│  6. Passkey authenticates → WSIM gets wallet_payment_token from BSIM    │
│                         │                                               │
│                         ▼                                               │
│  7. Token posted to SSIM → Payment completed via NSIM                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### Technical Implementation

**WebAuthn API for Passkey Authentication:**

```javascript
// WSIM: Trigger passkey authentication for payment
async function authenticatePayment(amount, merchantName, cardId) {
  // Get challenge from WSIM backend
  const challengeResponse = await fetch('/api/passkey/payment-challenge', {
    method: 'POST',
    body: JSON.stringify({ amount, merchantName, cardId })
  });
  const { challenge, allowCredentials } = await challengeResponse.json();

  // Trigger passkey prompt
  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: base64ToBuffer(challenge),
      allowCredentials: allowCredentials.map(cred => ({
        id: base64ToBuffer(cred.id),
        type: 'public-key',
        transports: ['internal', 'hybrid']
      })),
      userVerification: 'required',
      timeout: 60000
    }
  });

  // Send signed assertion to backend
  const verifyResponse = await fetch('/api/passkey/verify-payment', {
    method: 'POST',
    body: JSON.stringify({
      credentialId: bufferToBase64(credential.rawId),
      authenticatorData: bufferToBase64(credential.response.authenticatorData),
      clientDataJSON: bufferToBase64(credential.response.clientDataJSON),
      signature: bufferToBase64(credential.response.signature),
      cardId,
      amount,
      merchantName
    })
  });

  const { token } = await verifyResponse.json();
  return token; // wallet_payment_token
}
```

**iframe Permissions for Passkeys:**

```html
<!-- SSIM: iframe must allow publickey-credentials-get -->
<iframe
  src="https://wsim-auth-dev.banksim.ca/embed/card-picker"
  allow="publickey-credentials-get *"
></iframe>
```

**Security Benefits:**

1. **Transaction Binding** - The passkey challenge can include payment details (amount, merchant), making the signature specific to this transaction

2. **Replay Prevention** - Each authentication generates a unique signature that can't be reused

3. **Origin Verification** - Passkeys only work on the registered origin (wsim-auth-dev.banksim.ca)

4. **User Presence** - Requires active user gesture (biometric/PIN)

---

## Recommended Approach

### Phase 1: Popup with Passkey (Quickest to Implement)

1. WSIM creates `/popup/card-picker` endpoint
2. Implement passkey authentication in WSIM
3. SSIM opens popup, receives token via postMessage

**Why popup first:**
- Avoids iframe CSP complexity
- Full-page context for passkey prompts
- Easier to implement WSIM login flow

### Phase 2: iframe Embed (Better UX)

1. WSIM creates `/embed/card-picker` with minimal UI
2. Configure CSP to allow SSIM origins
3. Test passkey prompts within iframe context

### Phase 3: API-First (Advanced)

1. WSIM exposes card list API
2. SSIM renders native card picker
3. Passkey authentication via WSIM API

---

## Security Considerations

### iframe Security

| Concern | Mitigation |
|---------|------------|
| Clickjacking | WSIM sets `X-Frame-Options: ALLOW-FROM ssim-origins` |
| Token interception | Only post tokens to whitelisted origins |
| Session hijacking | Passkey required for each payment |
| Phishing | Passkey bound to WSIM origin only |

### Passkey Security

| Feature | Benefit |
|---------|---------|
| Origin binding | Passkey only works on wsim-auth-dev.banksim.ca |
| User verification | Requires biometric or PIN |
| Challenge-response | Each auth is unique, prevents replay |
| No shared secrets | Private key never leaves device |

### Token Security

- `wallet_payment_token` has 5-minute TTL
- JWT signed by BSIM, verified on authorization
- Token is single-use (consumed on successful authorization)

---

## Implementation Checklist

### WSIM Changes

- [ ] Add passkey registration flow for users
- [ ] Add passkey authentication endpoints
- [ ] Create `/popup/card-picker` page
- [ ] Create `/embed/card-picker` page (Phase 2)
- [ ] Implement postMessage communication
- [ ] Configure CSP headers for embedding
- [ ] Add card list API endpoint (Phase 3)

### SSIM Changes

- [ ] Add "Pay with WSIM" embedded option
- [ ] Implement popup/iframe loader
- [ ] Add postMessage listener for tokens
- [ ] Handle authentication states (logged in, not logged in)
- [ ] Error handling for popup blockers

### BSIM Changes

- [ ] None required - existing token flow works

### NSIM Changes

- [ ] None required - already handles wallet_payment_token

---

## References

- [WebAuthn Spec](https://www.w3.org/TR/webauthn-2/)
- [Passkeys.dev](https://passkeys.dev/)
- [postMessage API](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage)
- [iframe allow attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#allow)
