# NSIM - Claude Instructions

This file contains instructions for Claude (and other AI assistants) when working on this project.

## Project Overview

NSIM (Network Simulator) is a payment network middleware that routes payment requests between merchants (SSIM) and card issuers (BSIM). It handles authorization, capture, void, and refund operations with webhook notifications.

## Tech Stack

- **Runtime:** Node.js 20+ with ES Modules
- **Language:** TypeScript 5.x
- **Framework:** Express.js 5.x
- **Database:** PostgreSQL with Prisma ORM
- **Queue:** BullMQ with Redis
- **Testing:** Jest with ts-jest

## Important Reminders

### API Specification Updates

When making changes to NSIM APIs, **always update the corresponding specification files**:

| Change Type | File to Update |
|------------|----------------|
| REST endpoint changes | `openapi.yaml` |
| Request/response schema changes | `openapi.yaml` |
| Webhook payload changes | `asyncapi.yaml` |
| New webhook event types | `asyncapi.yaml` |

**After updating specs:**
1. Bump the version number in the spec file
2. Update `docs/README.md` if adding new endpoints/events
3. Update `CHANGELOG.md` with the changes

### Database Schema Changes

When modifying the Prisma schema (`prisma/schema.prisma`):
1. All tables use `nsim_` prefix (shared database with BSIM)
2. Run `npx prisma generate` after schema changes
3. Update deployment docs if migration is needed
4. Run tests to verify repository layer still works

### Webhook Format

NSIM webhooks use this format (ensure consistency):
- Header: `X-Webhook-Signature: sha256=<hex>`
- Payload field: `type` (not `event`) for the event type
- Payload structure: `{ id, type, timestamp, data }`

### Testing

- All tests must pass before committing (`npm test`)
- Currently 181 tests across 13 test suites
- Mock repositories are in `src/__tests__/mocks/`
- Use `jest.unstable_mockModule` for ESM mocking

## Key Files

| File | Purpose |
|------|---------|
| `src/services/payment.ts` | Payment processing logic |
| `src/services/webhook.ts` | Webhook management and delivery |
| `src/routes/payment.ts` | Payment REST endpoints |
| `src/routes/webhook.ts` | Webhook REST endpoints |
| `prisma/schema.prisma` | Database schema |
| `openapi.yaml` | REST API specification |
| `asyncapi.yaml` | Webhook event specification |

## Common Tasks

### Adding a new endpoint
1. Add route handler in `src/routes/`
2. Add business logic in `src/services/`
3. Add tests in `src/__tests__/`
4. Update `openapi.yaml` with endpoint spec
5. Update `CHANGELOG.md`

### Adding a new webhook event
1. Add event type to `src/types/webhook.ts`
2. Add to Prisma enum in `prisma/schema.prisma`
3. Trigger event from appropriate service method
4. Update `asyncapi.yaml` with event spec
5. Update tests and `CHANGELOG.md`
