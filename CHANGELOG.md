# Changelog

All notable changes to the NSIM (Network Simulator) project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Initial Payment Network Service** - Express.js/TypeScript payment routing middleware
  - Routes payment requests between SSIM (merchants) and BSIM (card issuers)
  - Payment operations: authorize, capture, void, refund
  - Transaction status tracking with in-memory store (PostgreSQL coming soon)
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

- **Jest Testing Framework** - Comprehensive unit test coverage
  - 60 tests covering BsimClient, PaymentService, and payment routes
  - MockBsimClient for simulating BSIM payment responses
  - Tests for authorization, capture, void, and refund flows
  - Full payment lifecycle integration tests
  - ESM-compatible Jest configuration with ts-jest
  - Test commands: `npm test`, `npm run test:watch`, `npm run test:coverage`

### Coming Soon
- Redis queue for async payment processing
- PostgreSQL for persistent transaction storage
- AWS SQS support for production queues
- Webhook callbacks to merchants
