# NSIM TODO

## Completed

- [x] **WSIM Wallet Payment Integration**
  - End-to-end wallet payment flow working
  - Token diagnostics and debugging endpoints
  - Support for `wallet_payment_token` JWT and `wsim_bsim_` prefix tokens

- [x] **Core Payment Operations**
  - Authorization with BSIM integration
  - Capture (full and partial)
  - Void
  - Refund (full and partial)

- [x] **Webhook System**
  - BullMQ-based async delivery queue
  - HMAC-SHA256 signature verification
  - Retry logic with exponential backoff
  - Webhook management API (CRUD)

- [x] **Testing**
  - 170 unit tests across 12 test suites
  - ~84% code coverage
  - MockBsimClient for isolated testing
  - E2E tests moved to WSIM repo for centralized cross-service testing

- [x] **Infrastructure**
  - Docker support with multi-stage builds
  - Redis integration for queues
  - Express.js/TypeScript setup

## In Progress

- [ ] **PostgreSQL Integration**
  - Replace in-memory transaction store with PostgreSQL
  - Add database migrations
  - Transaction persistence across restarts

## Planned

- [ ] **AWS SQS Support**
  - Alternative to Redis for production queues
  - Configuration for AWS deployment

- [ ] **OpenAPI Swagger UI**
  - Serve interactive API docs at `/docs`
  - Auto-generate from `openapi.yaml`

- [ ] **Metrics & Monitoring**
  - Prometheus metrics endpoint
  - Transaction success/failure rates
  - Latency histograms

- [ ] **Rate Limiting**
  - Per-merchant rate limits
  - Configurable thresholds

- [ ] **API Key Authentication**
  - Validate `X-API-Key` header for SSIM requests
  - Key management API

## Future Considerations

- [ ] **Multi-BSIM Routing**
  - Route to different BSIM instances based on card BIN
  - Load balancing across issuers

- [ ] **Idempotency Keys**
  - Prevent duplicate transactions
  - Safe retry handling

- [ ] **3DS Support**
  - Strong Customer Authentication flow
  - Challenge handling
