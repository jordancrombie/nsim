import { Router, Request, Response } from 'express';
import {
  registerWebhook,
  getWebhook,
  getWebhooksForMerchant,
  updateWebhook,
  deleteWebhook,
  getWebhookStats,
} from '../services/webhook.js';
import { WebhookEventType } from '../types/webhook.js';

const router = Router();

// Valid webhook event types
const VALID_EVENTS: WebhookEventType[] = [
  'payment.authorized',
  'payment.captured',
  'payment.voided',
  'payment.refunded',
  'payment.declined',
  'payment.expired',
  'payment.failed',
];

/**
 * POST /api/v1/webhooks
 * Register a new webhook
 */
router.post('/', (req: Request, res: Response) => {
  const { merchantId, url, events, secret } = req.body;

  // Validate required fields
  if (!merchantId || !url || !events) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['merchantId', 'url', 'events'],
    });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch {
    return res.status(400).json({
      error: 'Invalid webhook URL',
    });
  }

  // Validate events array
  if (!Array.isArray(events) || events.length === 0) {
    return res.status(400).json({
      error: 'Events must be a non-empty array',
      validEvents: VALID_EVENTS,
    });
  }

  // Check all events are valid
  const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEventType));
  if (invalidEvents.length > 0) {
    return res.status(400).json({
      error: 'Invalid event types',
      invalidEvents,
      validEvents: VALID_EVENTS,
    });
  }

  const webhook = registerWebhook({
    merchantId,
    url,
    events: events as WebhookEventType[],
    secret,
  });

  // Return webhook config (including secret only on creation)
  res.status(201).json({
    id: webhook.id,
    merchantId: webhook.merchantId,
    url: webhook.url,
    events: webhook.events,
    secret: webhook.secret, // Only returned on creation
    createdAt: webhook.createdAt.toISOString(),
  });
});

/**
 * GET /api/v1/webhooks/:id
 * Get a webhook by ID
 */
router.get('/:id', (req: Request, res: Response) => {
  const webhook = getWebhook(req.params.id);

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  res.json({
    id: webhook.id,
    merchantId: webhook.merchantId,
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    createdAt: webhook.createdAt.toISOString(),
    updatedAt: webhook.updatedAt.toISOString(),
  });
});

/**
 * GET /api/v1/webhooks/merchant/:merchantId
 * Get all webhooks for a merchant
 */
router.get('/merchant/:merchantId', (req: Request, res: Response) => {
  const webhooks = getWebhooksForMerchant(req.params.merchantId);

  res.json({
    merchantId: req.params.merchantId,
    webhooks: webhooks.map((w) => ({
      id: w.id,
      url: w.url,
      events: w.events,
      isActive: w.isActive,
      createdAt: w.createdAt.toISOString(),
      updatedAt: w.updatedAt.toISOString(),
    })),
  });
});

/**
 * PATCH /api/v1/webhooks/:id
 * Update a webhook
 */
router.patch('/:id', (req: Request, res: Response) => {
  const { url, events, isActive } = req.body;
  const updates: any = {};

  // Validate URL if provided
  if (url !== undefined) {
    try {
      new URL(url);
      updates.url = url;
    } catch {
      return res.status(400).json({ error: 'Invalid webhook URL' });
    }
  }

  // Validate events if provided
  if (events !== undefined) {
    if (!Array.isArray(events) || events.length === 0) {
      return res.status(400).json({
        error: 'Events must be a non-empty array',
        validEvents: VALID_EVENTS,
      });
    }

    const invalidEvents = events.filter((e: string) => !VALID_EVENTS.includes(e as WebhookEventType));
    if (invalidEvents.length > 0) {
      return res.status(400).json({
        error: 'Invalid event types',
        invalidEvents,
        validEvents: VALID_EVENTS,
      });
    }
    updates.events = events as WebhookEventType[];
  }

  if (isActive !== undefined) {
    updates.isActive = Boolean(isActive);
  }

  const webhook = updateWebhook(req.params.id, updates);

  if (!webhook) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  res.json({
    id: webhook.id,
    merchantId: webhook.merchantId,
    url: webhook.url,
    events: webhook.events,
    isActive: webhook.isActive,
    updatedAt: webhook.updatedAt.toISOString(),
  });
});

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook
 */
router.delete('/:id', (req: Request, res: Response) => {
  const deleted = deleteWebhook(req.params.id);

  if (!deleted) {
    return res.status(404).json({ error: 'Webhook not found' });
  }

  res.status(204).send();
});

/**
 * GET /api/v1/webhooks/stats
 * Get webhook statistics (admin endpoint)
 */
router.get('/admin/stats', (req: Request, res: Response) => {
  const stats = getWebhookStats();
  res.json(stats);
});

/**
 * GET /api/v1/webhooks/events
 * List valid webhook event types
 */
router.get('/events/list', (req: Request, res: Response) => {
  res.json({
    events: VALID_EVENTS,
    descriptions: {
      'payment.authorized': 'Payment has been authorized (funds held)',
      'payment.captured': 'Payment has been captured (funds transferred)',
      'payment.voided': 'Authorization has been voided (funds released)',
      'payment.refunded': 'Payment has been refunded (full or partial)',
      'payment.declined': 'Payment was declined by the issuer',
      'payment.expired': 'Authorization has expired',
      'payment.failed': 'Payment processing failed due to an error',
    },
  });
});

export default router;
