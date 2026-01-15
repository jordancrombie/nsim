-- CreateEnum
CREATE TYPE "nsim_payment_status" AS ENUM ('pending', 'authorized', 'captured', 'voided', 'refunded', 'declined', 'expired', 'failed');

-- CreateEnum
CREATE TYPE "nsim_webhook_event_type" AS ENUM ('payment_authorized', 'payment_captured', 'payment_voided', 'payment_refunded', 'payment_declined', 'payment_expired', 'payment_failed');

-- CreateTable
CREATE TABLE "nsim_payment_transactions" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "merchantName" TEXT,
    "orderId" TEXT NOT NULL,
    "cardToken" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'CAD',
    "status" "nsim_payment_status" NOT NULL DEFAULT 'pending',
    "authorizationCode" TEXT,
    "capturedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "metadata" JSONB,
    "declineReason" TEXT,
    "bsimId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "nsim_payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nsim_webhook_configs" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "events" "nsim_webhook_event_type"[],
    "secret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nsim_webhook_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nsim_webhook_deliveries" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "event" "nsim_webhook_event_type" NOT NULL,
    "payloadId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "error" TEXT,
    "payload" JSONB NOT NULL,
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "nsim_webhook_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "nsim_payment_transactions_merchantId_idx" ON "nsim_payment_transactions"("merchantId");

-- CreateIndex
CREATE INDEX "nsim_payment_transactions_orderId_idx" ON "nsim_payment_transactions"("orderId");

-- CreateIndex
CREATE INDEX "nsim_payment_transactions_status_idx" ON "nsim_payment_transactions"("status");

-- CreateIndex
CREATE INDEX "nsim_payment_transactions_expiresAt_idx" ON "nsim_payment_transactions"("expiresAt");

-- CreateIndex
CREATE INDEX "nsim_payment_transactions_bsimId_idx" ON "nsim_payment_transactions"("bsimId");

-- CreateIndex
CREATE INDEX "nsim_payment_transactions_createdAt_idx" ON "nsim_payment_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "nsim_webhook_configs_merchantId_idx" ON "nsim_webhook_configs"("merchantId");

-- CreateIndex
CREATE INDEX "nsim_webhook_configs_isActive_idx" ON "nsim_webhook_configs"("isActive");

-- CreateIndex
CREATE INDEX "nsim_webhook_deliveries_webhookId_idx" ON "nsim_webhook_deliveries"("webhookId");

-- CreateIndex
CREATE INDEX "nsim_webhook_deliveries_transactionId_idx" ON "nsim_webhook_deliveries"("transactionId");

-- CreateIndex
CREATE INDEX "nsim_webhook_deliveries_createdAt_idx" ON "nsim_webhook_deliveries"("createdAt");

-- CreateIndex
CREATE INDEX "nsim_webhook_deliveries_success_idx" ON "nsim_webhook_deliveries"("success");

-- AddForeignKey
ALTER TABLE "nsim_webhook_deliveries" ADD CONSTRAINT "nsim_webhook_deliveries_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "nsim_webhook_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
