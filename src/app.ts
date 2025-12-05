import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config/index.js';
import paymentRoutes from './routes/payment.js';
import healthRoutes from './routes/health.js';
import webhookRoutes from './routes/webhook.js';
import diagnosticsRoutes from './routes/diagnostics.js';

const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
app.use(express.json());

// Routes
app.use('/health', healthRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/diagnostics', diagnosticsRoutes);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.nodeEnv === 'development' ? err.message : undefined,
  });
});

export default app;
