import app from './app.js';
import { config } from './config/index.js';

const server = app.listen(config.port, () => {
  console.log(`NSIM Payment Network running on port ${config.port}`);
  console.log(`Environment: ${config.nodeEnv}`);
  console.log(`Queue mode: ${config.useQueue ? 'async' : 'sync'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
