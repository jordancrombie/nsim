# Changelog

All notable changes to the NSIM (Network Simulator) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Prisma Migration Infrastructure** - Proper migration support for production deployments
  - Added `prisma/migrations/` directory with baseline `20260115164136_init` migration
  - Enables safe schema evolution with `prisma migrate deploy`
  - Replaces risky `db push` workaround in production pipeline
  - One-time `migrate resolve --applied` required on production (see `LOCAL_DEPLOYMENT_PLANS/MIGRATION_BASELINE_FIX.md`)

- **Database Persistence** - PostgreSQL storage with Prisma ORM
  - Replaces in-memory storage with persistent PostgreSQL database
  - Repository pattern for clean separation of concerns
  - Payment transactions stored in `nsim_payment_transactions` table
  - Webhook configurations stored in `nsim_webhook_configs` table
  - Webhook delivery history stored in `nsim_webhook_deliveries` table
  - Shared database architecture with `nsim_` prefix for all tables/enums
  - Works alongside BSIM tables in the same physical database
  - Mock repositories for testing (181 tests passing)
  - Environment: Set `DATABASE_URL` to PostgreSQL connection string

- **Multi-BSIM Support** - Payment routing to multiple BSIM (bank) instances
  - BSIM provider registry with env-based configuration
  - Automatic bank detection from token format: `wsim_{bsimId}_xxx`
  - Support for NewBank and future bank instances
  - Token analysis extracts `bsimId` for intelligent routing
  - Transactions track originating BSIM for capture/void/refund
  - Environment variables: `BSIM_NEWBANK_URL`, `BSIM_NEWBANK_KEY`, or `BSIM_PROVIDERS` JSON
  - OpenAPI spec updated to v1.1.0 with multi-bank documentation
  - 181 tests passing (11 new routing tests)

### Fixed

- **Webhook payload field name mismatch** (2025-12-27)
  - NSIM sent event type as `event` field, but SSIM expects `type` field
  - Fix: Renamed `event` to `type` in WebhookPayload interface
  - Affected: SSIM receiving `undefined` event type, webhooks not processed

- **Webhook signature format mismatch** (2025-12-25)
  - NSIM sent signature as plain hex, but SSIM expects `sha256=<hex>` format
  - Fix: Added `sha256=` prefix to `X-Webhook-Signature` header
  - Affected: Webhook deliveries failing signature verification on SSIM side

- **Critical: merchantName field causing transaction save failure** (2025-12-25)
  - Transactions were authorized by BSIM but failed to persist to database
  - Root cause: `merchantName` was required but SSIMs don't send it
  - Fix: Made `merchantName` optional with automatic fallback to `merchantId`
  - Affected: Transactions approved but webhooks not sent, causing "order not found" errors

### Changed

- **E2E Test Suite Moved to WSIM** - The Playwright E2E tests were moved to the WSIM repository for centralized cross-service testing. NSIM retains 181 unit tests with ~85% coverage.

### Maintenance

- **Build Maintenance Improvements** (2025-12-18)
  - Updated bullmq from 5.65.1 to 5.66.1 (patch release)
  - Updated @types/node from v24 to v25 for Node.js 25.x type definitions
  - Added `engines` field to package.json enforcing Node.js >=20.0.0
  - Suppressed dotenv promotional messages with `{ quiet: true }` option
  - Build passes cleanly with no warnings
  - Zero security vulnerabilities (npm audit clean)

---

## Previous Releases

### Added (Historical)

- **Project Logo** - Added NSIM branding to README

- **WSIM Wallet Payment Integration** - End-to-end wallet payment support
  - Full integration with WSIM (Wallet Simulator) for wallet-initiated payments
  - Support for `wallet_payment_token` JWT type from BSIM
  - Support for `wsim_bsim_` prefixed tokens
  - Token analysis and debugging utilities for troubleshooting
  - Successful end-to-end transaction flow: WSIM → SSIM → NSIM → BSIM

- **Initial Payment Network Service** - Express.js/TypeScript payment routing middleware
  - Routes payment requests between SSIM (merchants) and BSIM (card issuers)
  - Payment operations: authorize, capture, void, refund
  - Transaction status tracking with PostgreSQL persistence
  - BSIM client stub for integration testing

- **OpenAPI 3.0 Specification** - Complete API contract for SSIM integration
  - Full documentation of all payment endpoints
  - Request/response schemas with examples
  - Authentication via X-API-Key header
  - Available at `openapi.yaml`

- **Health Check Endpoints**
  - `GET /health` - Service health status
  - `GET /health/ready` - Readiness probe with dependency checks

- **Payment API Endpoints** (v1)
  - `POST /api/v1/payments/authorize` - Request payment authorization
  - `POST /api/v1/payments/:transactionId/capture` - Capture authorized payment
  - `POST /api/v1/payments/:transactionId/void` - Void pending authorization
  - `POST /api/v1/payments/:transactionId/refund` - Refund captured payment
  - `GET /api/v1/payments/:transactionId` - Get transaction status

- **Project Infrastructure**
  - Express.js with TypeScript configuration
  - Helmet for security headers
  - Morgan for request logging
  - CORS support for cross-origin requests
  - Environment configuration via dotenv

### Technical Details
- **Runtime**: Node.js with ES Modules
- **Framework**: Express.js 5.x
- **Language**: TypeScript 5.x
- **Port**: 3006 (configurable via PORT env)
- **Accessible at**: https://payment.banksim.ca (via BSIM nginx proxy)

- **BSIM HTTP Client** - Real integration with BSIM payment handler
  - Replaced stub implementation with actual HTTP calls to BSIM
  - Calls BSIM's `/api/payment-network/authorize` for payment authorization
  - Calls BSIM's `/api/payment-network/capture` for capturing payments
  - Calls BSIM's `/api/payment-network/void` for voiding authorizations
  - Calls BSIM's `/api/payment-network/refund` for refunding payments
  - Card token validation against BSIM consent records
  - Configurable via `BSIM_BASE_URL` and `BSIM_API_KEY` environment variables

- **Docker Support** - Production-ready containerization
  - Multi-stage Dockerfile with builder and production stages
  - Non-root user for security
  - Health check endpoint configuration
  - Integrated into BSIM's docker-compose.yml as `payment-network` service
  - Accessible via nginx at `payment.banksim.ca` and `payment-dev.banksim.ca`

- **Token Diagnostics & Debugging** - Support for WSIM wallet payment integration
  - Token analysis utility for debugging wallet payment tokens
  - Detects token prefixes (`ctok_`, `wsim_bsim_`) and JWT format
  - Decodes JWT claims (type, issuer, expiry) for debugging
  - Enhanced authorization logging with token analysis
  - Special logging for wallet token failures (WALLET TOKEN DECLINED)
  - Diagnostic endpoints for token inspection:
    - `POST /api/v1/diagnostics/analyze-token` - Analyze token without payment
    - `GET /api/v1/diagnostics/token-types` - List supported token formats
  - Expiry warnings for tokens near TTL (wallet tokens have 5-minute TTL)

- **Jest Testing Framework** - Comprehensive unit test coverage
  - 181 tests across 13 test suites (~85% code coverage)
  - MockBsimClient for simulating BSIM payment responses
  - Tests for authorization, capture, void, and refund flows
  - Full payment lifecycle integration tests
  - BSIM failure handling tests (network errors, service failures)
  - Authorization expiry tests
  - Webhook service and route tests (100% coverage)
  - Health endpoint tests (100% coverage)
  - Queue infrastructure tests (Redis, BullMQ, expiry scheduler)
  - App integration tests (middleware, routing)
  - ESM-compatible Jest configuration with ts-jest
  - Test commands: `npm test`, `npm run test:watch`, `npm run test:coverage`

- **Queue System & Reliability** - BullMQ-based async processing
  - Redis connection management with graceful shutdown
  - Webhook delivery queue with retry logic (up to 5 retries with exponential backoff)
  - Authorization expiry scheduler (voids authorizations after 7 days)
  - HMAC-SHA256 webhook signature verification
  - Webhook management API (register, list, update, delete)

### Coming Soon
- AWS SQS support for production queues
- OpenAPI Swagger UI at `/docs`
