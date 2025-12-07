# End-to-End Test Implementation Plan

> **Purpose:** Implementation plan for comprehensive E2E tests spanning BSIM, WSIM, and NSIM to validate the complete payment ecosystem.

## Overview

This plan outlines the creation of a Playwright-based E2E test suite that validates the full user journey from bank account creation through wallet enrollment to payment processing.

### Scope

The tests will cover:
1. **BSIM User Setup** - Create user, register passkey, add credit cards
2. **WSIM Enrollment** - Create wallet user via BSIM OAuth, bind cards
3. **WSIM Passkey** - Register wallet passkey for authentication
4. **NSIM Payments** - Execute payment flows using wallet tokens

### Design Principles

- **Reusable by SSIM** - Test infrastructure designed for SSIM team to extend
- **Environment Agnostic** - Works against dev and prod via configuration
- **Isolated Test Data** - UUID-based users prevent collisions
- **Learn from BSIM** - Adopt proven patterns from BSIM's test suite

---

## Architecture

```
nsim/
├── e2e/
│   ├── playwright.config.ts        # Main config (multi-environment)
│   ├── global-setup.ts             # Pre-test cleanup
│   ├── global-teardown.ts          # Post-test cleanup
│   ├── package.json                # Playwright dependencies
│   ├── tsconfig.json               # TypeScript config
│   │
│   ├── helpers/
│   │   ├── bsim/
│   │   │   ├── auth.helpers.ts     # BSIM login/signup
│   │   │   ├── passkey.helpers.ts  # BSIM passkey operations
│   │   │   └── cards.helpers.ts    # Credit card management
│   │   │
│   │   ├── wsim/
│   │   │   ├── enroll.helpers.ts   # WSIM enrollment flow
│   │   │   ├── auth.helpers.ts     # WSIM login/logout
│   │   │   └── passkey.helpers.ts  # WSIM passkey operations
│   │   │
│   │   ├── nsim/
│   │   │   └── payment.helpers.ts  # Payment API helpers
│   │   │
│   │   └── webauthn.helpers.ts     # Virtual authenticator (from BSIM)
│   │
│   ├── fixtures/
│   │   ├── test-data.ts            # Test user/card generators
│   │   └── urls.ts                 # Environment-aware URLs
│   │
│   └── tests/
│       ├── setup/
│       │   ├── bsim-user.spec.ts   # BSIM user creation + passkey
│       │   └── bsim-cards.spec.ts  # Credit card setup
│       │
│       ├── wsim/
│       │   ├── enrollment.spec.ts  # WSIM enrollment via BSIM OAuth
│       │   └── passkey.spec.ts     # WSIM passkey registration
│       │
│       └── payments/
│           ├── authorize.spec.ts   # Payment authorization
│           ├── capture.spec.ts     # Capture flows
│           └── refund.spec.ts      # Refund flows
│
└── LOCAL_DEPLOYMENT_PLANS/
    └── E2E_TEST_GUIDE.md           # Guide for SSIM team
```

---

## Phase 1: Infrastructure Setup

### 1.1 Playwright Installation

| Task | Notes |
|------|-------|
| Create `e2e/` directory structure | Separate from Jest unit tests |
| Initialize `package.json` with Playwright | `@playwright/test@^1.49.0` |
| Create `playwright.config.ts` | Multi-project (chromium, webkit) |
| Create `tsconfig.json` | ES2020 target, strict mode |
| Add npm scripts to root `package.json` | `test:e2e`, `test:e2e:headed`, etc. |
| Update `.gitignore` | Exclude `e2e/test-results/`, `e2e/playwright-report/` |

### 1.2 Environment Configuration

```typescript
// e2e/fixtures/urls.ts
export function getUrls() {
  const env = process.env.TEST_ENV || 'dev';

  const configs = {
    dev: {
      bsim: 'https://dev.banksim.ca',
      bsimAuth: 'https://auth-dev.banksim.ca',
      wsim: 'https://wsim-dev.banksim.ca',
      wsimAuth: 'https://wsim-auth-dev.banksim.ca',
      nsim: 'https://payment-dev.banksim.ca',
      ssim: 'https://ssim-dev.banksim.ca'
    },
    prod: {
      bsim: 'https://banksim.ca',
      bsimAuth: 'https://auth.banksim.ca',
      wsim: 'https://wsim.banksim.ca',
      wsimAuth: 'https://wsim-auth.banksim.ca',
      nsim: 'https://payment.banksim.ca',
      ssim: 'https://ssim.banksim.ca'
    }
  };

  return configs[env];
}
```

### 1.3 WebAuthn Helpers (Adapted from BSIM)

Copy and adapt BSIM's `webauthn.helpers.ts`:
- `setupVirtualAuthenticator(page)` - Create CTAP2 virtual authenticator
- `simulatePasskeySuccess(context, action)` - Simulate successful auth
- `simulatePasskeyFailure(context, action)` - Test error handling
- `getStoredCredentials(context)` - Inspect credentials
- `teardownVirtualAuthenticator(context)` - Cleanup

---

## Phase 2: BSIM Setup Helpers

### 2.1 Test Data Generation

```typescript
// e2e/fixtures/test-data.ts
export function generateTestEmail(prefix = 'e2e'): string {
  return `${prefix}-${crypto.randomUUID()}@testuser.banksim.ca`;
}

export function createTestUser(overrides?: Partial<TestUser>): TestUser {
  return {
    email: generateTestEmail(),
    password: 'TestPassword123!',
    firstName: 'E2E',
    lastName: 'TestUser',
    ...overrides
  };
}

export const TEST_CARDS = {
  visa: {
    number: '4111111111111111',
    expiry: '12/28',
    cvv: '123',
    name: 'E2E Test User'
  },
  mastercard: {
    number: '5555555555554444',
    expiry: '12/28',
    cvv: '123',
    name: 'E2E Test User'
  }
};
```

### 2.2 BSIM Auth Helpers

```typescript
// e2e/helpers/bsim/auth.helpers.ts
export async function signupBsimUser(page: Page, user: TestUser): Promise<void> {
  // Navigate to BSIM signup
  // Fill account info (step 1)
  // Fill customer info (step 2)
  // Handle passkey prompt (skip for now)
  // Verify dashboard
}

export async function loginBsimUser(page: Page, email: string, password: string): Promise<void> {
  // Navigate to login
  // Fill credentials
  // Submit and verify dashboard
}

export async function logoutBsimUser(page: Page): Promise<void> {
  // Click logout
  // Verify redirect
}
```

### 2.3 BSIM Passkey Helpers

```typescript
// e2e/helpers/bsim/passkey.helpers.ts
export async function registerBsimPasskey(
  page: Page,
  webauthn: WebAuthnContext
): Promise<void> {
  // Navigate to security settings
  // Click "Set Up Passkey"
  // Simulate passkey registration
  // Verify success message
}

export async function loginWithBsimPasskey(
  page: Page,
  webauthn: WebAuthnContext
): Promise<void> {
  // Navigate to login
  // Click "Sign in with Passkey"
  // Simulate passkey authentication
  // Verify dashboard
}
```

### 2.4 BSIM Card Helpers

```typescript
// e2e/helpers/bsim/cards.helpers.ts
export async function addCreditCard(page: Page, card: TestCard): Promise<void> {
  // Navigate to credit cards page
  // Click "Add Card"
  // Fill card details
  // Submit and verify
}

export async function getCardCount(page: Page): Promise<number> {
  // Count cards displayed on page
}
```

---

## Phase 3: WSIM Enrollment Helpers

### 3.1 WSIM Enrollment Flow

```typescript
// e2e/helpers/wsim/enroll.helpers.ts
export async function enrollWsimUser(
  page: Page,
  options: {
    skipPassword?: boolean;
    selectAllCards?: boolean;
  } = {}
): Promise<void> {
  const urls = getUrls();

  // Step 1: Navigate to enrollment
  await page.goto(`${urls.wsim}/enroll`);

  // Step 2: Password setup (or skip)
  if (options.skipPassword) {
    await page.getByRole('button', { name: /skip/i }).click();
  } else {
    // Fill password form
  }

  // Step 3: Select bank (BSIM)
  await page.getByRole('button', { name: /banksim/i }).click();

  // Step 4: BSIM OAuth flow (handled in same browser context)
  // - User already logged into BSIM from previous test
  // - Consent screen appears
  // - Approve access

  // Step 5: Card selection
  if (options.selectAllCards) {
    await page.getByRole('checkbox', { name: /select all/i }).click();
  }

  // Step 6: Complete enrollment
  await page.getByRole('button', { name: /complete/i }).click();

  // Verify success
  await expect(page).toHaveURL(/\/dashboard/);
}
```

### 3.2 WSIM Auth Helpers

```typescript
// e2e/helpers/wsim/auth.helpers.ts
export async function loginWsimUser(
  page: Page,
  email: string,
  password: string
): Promise<void> {
  // Navigate to WSIM login
  // Fill credentials
  // Verify dashboard
}

export async function loginWsimWithPasskey(
  page: Page,
  webauthn: WebAuthnContext
): Promise<void> {
  // Navigate to WSIM login
  // Click passkey option
  // Simulate passkey auth
  // Verify dashboard
}
```

### 3.3 WSIM Passkey Helpers

```typescript
// e2e/helpers/wsim/passkey.helpers.ts
export async function registerWsimPasskey(
  page: Page,
  webauthn: WebAuthnContext
): Promise<void> {
  // Navigate to profile/settings
  // Click passkey section
  // Click "Add Passkey"
  // Simulate registration
  // Verify success
}
```

---

## Phase 4: Test Specifications

### 4.1 BSIM User Setup Tests

```typescript
// e2e/tests/setup/bsim-user.spec.ts
test.describe('BSIM User Setup', () => {
  test.describe.configure({ mode: 'serial' });

  let testUser: TestUser;
  let webauthn: WebAuthnContext;

  test.beforeAll(async () => {
    testUser = createTestUser();
  });

  test('create BSIM account', async ({ page }) => {
    await signupBsimUser(page, testUser);
  });

  test('register BSIM passkey', async ({ page }) => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'WebAuthn requires Chromium');

    webauthn = await setupVirtualAuthenticator(page);
    await loginBsimUser(page, testUser.email, testUser.password);
    await registerBsimPasskey(page, webauthn);
    await teardownVirtualAuthenticator(webauthn);
  });

  test('add credit cards', async ({ page }) => {
    await loginBsimUser(page, testUser.email, testUser.password);
    await addCreditCard(page, TEST_CARDS.visa);
    await addCreditCard(page, TEST_CARDS.mastercard);
    expect(await getCardCount(page)).toBe(2);
  });
});
```

### 4.2 WSIM Enrollment Tests

```typescript
// e2e/tests/wsim/enrollment.spec.ts
test.describe('WSIM Enrollment', () => {
  test.describe.configure({ mode: 'serial' });

  // Uses testUser from BSIM setup (shared state or re-login)

  test('enroll in WSIM via BSIM OAuth', async ({ page }) => {
    // Login to BSIM first (for OAuth flow)
    await loginBsimUser(page, testUser.email, testUser.password);

    // Start WSIM enrollment
    await enrollWsimUser(page, {
      skipPassword: true,
      selectAllCards: true
    });

    // Verify cards imported
    await expect(page.getByText(/visa.*4242/i)).toBeVisible();
  });

  test('register WSIM passkey', async ({ page }) => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'WebAuthn requires Chromium');

    const webauthn = await setupVirtualAuthenticator(page);
    await loginWsimUser(page, testUser.email, testUser.password);
    await registerWsimPasskey(page, webauthn);
    await teardownVirtualAuthenticator(webauthn);
  });

  test('login with WSIM passkey', async ({ page }) => {
    test.skip(({ browserName }) => browserName !== 'chromium', 'WebAuthn requires Chromium');

    const webauthn = await setupVirtualAuthenticator(page);
    await loginWsimWithPasskey(page, webauthn);
    await expect(page).toHaveURL(/\/dashboard/);
    await teardownVirtualAuthenticator(webauthn);
  });
});
```

### 4.3 Payment Flow Tests

```typescript
// e2e/tests/payments/authorize.spec.ts
test.describe('Payment Authorization', () => {
  test('authorize payment with wallet token', async ({ page, request }) => {
    // Get wallet payment token from WSIM
    // (This may need to use API or SSIM checkout flow)

    // Call NSIM authorize endpoint
    const response = await request.post(`${urls.nsim}/api/v1/payments/authorize`, {
      data: {
        cardToken: walletToken,
        amount: 1000,
        currency: 'CAD',
        merchantId: 'test-merchant',
        orderId: `order-${Date.now()}`
      },
      headers: {
        'X-API-Key': process.env.NSIM_API_KEY
      }
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('authorized');
  });
});
```

---

## Phase 5: Test Orchestration

### 5.1 Global Setup

```typescript
// e2e/global-setup.ts
export default async function globalSetup() {
  // Clean up test users from previous runs
  // Uses API endpoints with cleanup keys
  // Pattern: DELETE users with @testuser.banksim.ca emails
}
```

### 5.2 Global Teardown

```typescript
// e2e/global-teardown.ts
export default async function globalTeardown() {
  // Final cleanup
  // Generate test summary
}
```

### 5.3 Playwright Config

```typescript
// e2e/playwright.config.ts
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,  // Serial for dependent tests
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html'], ['list']],

  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',

  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry'
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});
```

---

## Phase 6: NPM Scripts

Add to root `package.json`:

```json
{
  "scripts": {
    "test:e2e": "cd e2e && npx playwright test",
    "test:e2e:headed": "cd e2e && npx playwright test --headed",
    "test:e2e:ui": "cd e2e && npx playwright test --ui",
    "test:e2e:debug": "cd e2e && npx playwright test --debug",
    "test:e2e:dev": "cd e2e && TEST_ENV=dev npx playwright test",
    "test:e2e:prod": "cd e2e && TEST_ENV=prod npx playwright test",
    "test:e2e:report": "cd e2e && npx playwright show-report"
  }
}
```

---

## Phase 7: Documentation for SSIM

### 7.1 Local Deployment Guide

Create `LOCAL_DEPLOYMENT_PLANS/E2E_TEST_GUIDE.md` with:

1. **Overview** of test architecture
2. **Setup Instructions** for running tests
3. **Helper Function Reference**
4. **Extending Tests** for SSIM-specific flows
5. **Test Data Management**
6. **Troubleshooting** common issues

### 7.2 Example SSIM Extension

```typescript
// Example: SSIM checkout flow test
// (SSIM team would add this to their own test suite)

import { enrollWsimUser, loginWsimUser } from '@nsim/e2e-helpers';

test('complete checkout with WSIM wallet', async ({ page }) => {
  // 1. Setup: User with WSIM wallet (use NSIM helpers)
  await loginWsimUser(page, testUser.email, testUser.password);

  // 2. SSIM-specific: Add item to cart
  await page.goto('https://ssim-dev.banksim.ca/products');
  await page.getByRole('button', { name: 'Add to Cart' }).click();

  // 3. SSIM-specific: Checkout
  await page.goto('https://ssim-dev.banksim.ca/checkout');

  // 4. Select WSIM payment
  await page.getByRole('button', { name: 'Pay with WSIM' }).click();

  // 5. WSIM popup/iframe card selection
  // ...

  // 6. Verify payment success
  await expect(page.getByText('Payment Successful')).toBeVisible();
});
```

---

## Implementation Order

| Phase | Tasks | Estimated Effort |
|-------|-------|------------------|
| **1** | Infrastructure setup (Playwright, config, structure) | Foundation |
| **2** | BSIM helpers (auth, passkey, cards) | Core helpers |
| **3** | WSIM helpers (enroll, auth, passkey) | Core helpers |
| **4** | Test specifications (setup, enrollment, payments) | Tests |
| **5** | Global setup/teardown | Orchestration |
| **6** | NPM scripts, CI integration | DevOps |
| **7** | SSIM documentation | Documentation |

---

## Success Criteria

- [ ] BSIM user can be created and configured with passkey + cards
- [ ] WSIM enrollment via BSIM OAuth works end-to-end
- [ ] WSIM passkey registration and login works
- [ ] Payment authorization with wallet token succeeds
- [ ] Tests run in both dev and prod environments
- [ ] SSIM team can extend tests for checkout flows
- [ ] Documentation enables other teams to contribute

---

## Dependencies

| Dependency | Status | Notes |
|------------|--------|-------|
| BSIM test cleanup endpoints | Exists | `/api/test-cleanup/users` |
| WSIM test cleanup endpoints | TBD | May need to add |
| Virtual authenticator support | Chromium only | Skip on WebKit |
| Test API keys | Required | For NSIM API calls |

---

## Open Questions

1. **Shared test user state**: Should tests share a single test user across specs, or create fresh users per spec?
   - Recommendation: Serial tests within a "full journey" spec, fresh users per spec file

2. **WSIM test cleanup**: Does WSIM have test cleanup endpoints like BSIM?
   - Action: Check with WSIM team or add if needed

3. **CI/CD Integration**: Where will E2E tests run?
   - Options: GitHub Actions, dedicated test server, local dev machines

---

## Related Documents

- [BSIM E2E Test Architecture](../bsim/e2e/docs/WEBAUTHN_TESTING_PLAN.md)
- [WSIM Enrollment Flow](./EMBEDDED_WALLET_PAYMENT.md)
- [MERCHANT_INTEGRATION_GUIDE.md](./MERCHANT_INTEGRATION_GUIDE.md)
