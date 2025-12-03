import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'nsim',
    timestamp: new Date().toISOString(),
  });
});

router.get('/ready', (req, res) => {
  // TODO: Check BSIM connectivity, Redis/queue connectivity
  res.json({
    status: 'ready',
    checks: {
      bsim: 'ok',
      queue: 'ok',
    },
  });
});

export default router;
