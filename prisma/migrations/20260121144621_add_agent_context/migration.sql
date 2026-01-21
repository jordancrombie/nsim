-- SACP: Add agent context fields to payment transactions
-- These fields store information about AI agent-initiated transactions

-- Add agent context columns
ALTER TABLE "nsim_payment_transactions" ADD COLUMN "agent_id" TEXT;
ALTER TABLE "nsim_payment_transactions" ADD COLUMN "agent_owner_id" TEXT;
ALTER TABLE "nsim_payment_transactions" ADD COLUMN "agent_human_present" BOOLEAN;
ALTER TABLE "nsim_payment_transactions" ADD COLUMN "agent_mandate_id" TEXT;
ALTER TABLE "nsim_payment_transactions" ADD COLUMN "agent_mandate_type" TEXT;

-- Create indexes for agent queries
CREATE INDEX "idx_tx_agent_id" ON "nsim_payment_transactions"("agent_id");
CREATE INDEX "idx_tx_agent_owner_id" ON "nsim_payment_transactions"("agent_owner_id");
