import { Router, Request, Response } from 'express';
import { getPaymentService } from '../services/payment.js';
import {
  PaymentAuthorizationRequest,
  PaymentCaptureRequest,
  PaymentVoidRequest,
  PaymentRefundRequest,
} from '../types/payment.js';

const router = Router();

/**
 * POST /api/v1/payments/authorize
 * Request authorization for a payment
 */
router.post('/authorize', async (req: Request, res: Response) => {
  try {
    const request: PaymentAuthorizationRequest = req.body;

    // Validate required fields
    if (!request.merchantId || !request.amount || !request.cardToken || !request.orderId) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['merchantId', 'amount', 'cardToken', 'orderId'],
      });
    }

    // SACP: Validate agentContext fields if present
    if (request.agentContext) {
      const { agentId, ownerId, humanPresent } = request.agentContext;
      if (!agentId || !ownerId || humanPresent === undefined) {
        return res.status(400).json({
          error: 'Invalid agentContext: missing required fields',
          required: ['agentId', 'ownerId', 'humanPresent'],
        });
      }
    }

    const response = await getPaymentService().authorize(request);
    res.status(response.status === 'authorized' ? 200 : 400).json(response);
  } catch (error) {
    console.error('Authorization error:', error);
    res.status(500).json({ error: 'Authorization failed' });
  }
});

/**
 * POST /api/v1/payments/:transactionId/capture
 * Capture an authorized payment
 */
router.post('/:transactionId/capture', async (req: Request, res: Response) => {
  try {
    const request: PaymentCaptureRequest = {
      transactionId: req.params.transactionId,
      amount: req.body.amount,
    };

    const response = await getPaymentService().capture(request);
    res.status(response.status === 'captured' ? 200 : 400).json(response);
  } catch (error) {
    console.error('Capture error:', error);
    res.status(500).json({ error: 'Capture failed' });
  }
});

/**
 * POST /api/v1/payments/:transactionId/void
 * Void an authorized payment
 */
router.post('/:transactionId/void', async (req: Request, res: Response) => {
  try {
    const request: PaymentVoidRequest = {
      transactionId: req.params.transactionId,
      reason: req.body.reason,
    };

    const response = await getPaymentService().void(request);
    res.status(response.status === 'voided' ? 200 : 400).json(response);
  } catch (error) {
    console.error('Void error:', error);
    res.status(500).json({ error: 'Void failed' });
  }
});

/**
 * POST /api/v1/payments/:transactionId/refund
 * Refund a captured payment
 */
router.post('/:transactionId/refund', async (req: Request, res: Response) => {
  try {
    const request: PaymentRefundRequest = {
      transactionId: req.params.transactionId,
      amount: req.body.amount,
      reason: req.body.reason,
    };

    const response = await getPaymentService().refund(request);
    // Return 200 for successful refunds (both partial and full)
    // Partial refunds keep status as 'captured', full refunds change to 'refunded'
    const isSuccess = response.status === 'refunded' || response.status === 'captured';
    res.status(isSuccess ? 200 : 400).json(response);
  } catch (error) {
    console.error('Refund error:', error);
    res.status(500).json({ error: 'Refund failed' });
  }
});

/**
 * GET /api/v1/payments/:transactionId
 * Get transaction status
 */
router.get('/:transactionId', async (req: Request, res: Response) => {
  try {
    const transaction = await getPaymentService().getTransaction(req.params.transactionId);
    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' });
    }
    res.json(transaction);
  } catch (error) {
    console.error('Get transaction error:', error);
    res.status(500).json({ error: 'Failed to get transaction' });
  }
});

export default router;
