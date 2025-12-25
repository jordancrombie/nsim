#!/bin/bash
#
# Register SSIM Webhooks with NSIM
# Run this script after deploying NSIM with a fresh database
#
# Usage:
#   ./scripts/register-ssim-webhooks.sh [environment]
#
# Environments:
#   dev  - Development (default)
#   prod - Production
#

set -e

ENVIRONMENT="${1:-dev}"

# NSIM endpoint based on environment
case "$ENVIRONMENT" in
  prod)
    NSIM_URL="https://payment.banksim.ca"
    ;;
  dev|*)
    NSIM_URL="https://payment-dev.banksim.ca"
    ;;
esac

echo "=== NSIM Webhook Registration ==="
echo "Environment: $ENVIRONMENT"
echo "NSIM URL: $NSIM_URL"
echo ""

# Function to register a webhook
register_webhook() {
  local merchant_id="$1"
  local webhook_url="$2"
  local description="$3"

  echo "Registering: $description"
  echo "  Merchant ID: $merchant_id"
  echo "  Webhook URL: $webhook_url"

  response=$(curl -s -X POST "$NSIM_URL/api/v1/webhooks" \
    -H "Content-Type: application/json" \
    -d "{
      \"merchantId\": \"$merchant_id\",
      \"url\": \"$webhook_url\",
      \"events\": [\"payment.authorized\", \"payment.captured\", \"payment.voided\", \"payment.refunded\", \"payment.declined\"]
    }")

  # Extract webhook ID and secret from response
  webhook_id=$(echo "$response" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
  secret=$(echo "$response" | grep -o '"secret":"[^"]*"' | cut -d'"' -f4)

  if [ -n "$webhook_id" ]; then
    echo "  ✓ Registered successfully"
    echo "  Webhook ID: $webhook_id"
    echo "  Secret: $secret"
    echo ""
  else
    echo "  ✗ Registration failed"
    echo "  Response: $response"
    echo ""
    return 1
  fi
}

# ============================================
# SSIM Webhook Registrations
# Add new SSIMs here as they are deployed
# ============================================

echo "--- Registering SSIM Webhooks ---"
echo ""

# Regal Moose Store (SSIM)
case "$ENVIRONMENT" in
  prod)
    register_webhook \
      "ssim-regal-moose" \
      "https://store.regalmoose.ca/api/webhooks/payment" \
      "Regal Moose Store (Production)"
    ;;
  dev|*)
    register_webhook \
      "ssim-regal-moose" \
      "https://store-dev.regalmoose.ca/api/webhooks/payment" \
      "Regal Moose Store (Development)"
    ;;
esac

# Add more SSIMs here as needed:
#
# register_webhook \
#   "ssim-another-store" \
#   "https://another-store.example.com/api/webhooks/payment" \
#   "Another Store"

echo "=== Registration Complete ==="
echo ""
echo "To verify registrations:"
echo "  curl $NSIM_URL/api/v1/webhooks/admin/stats"
echo ""
echo "To list webhooks for a merchant:"
echo "  curl $NSIM_URL/api/v1/webhooks/merchant/ssim-regal-moose"
