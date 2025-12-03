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

### Coming Soon
- Redis queue for async payment processing
- PostgreSQL for persistent transaction storage
- Real BSIM integration (replacing stubs)
- AWS SQS support for production queues
- Webhook callbacks to merchants
