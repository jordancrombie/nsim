import { describe, it, expect, beforeAll } from '@jest/globals';
import express, { Express } from 'express';
import request from 'supertest';
import healthRoutes from '../../routes/health';

let app: Express;

beforeAll(() => {
  app = express();
  app.use(express.json());
  app.use('/health', healthRoutes);
});

describe('Health Routes', () => {
  describe('GET /health', () => {
    it('should return healthy status', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('healthy');
      expect(response.body.service).toBe('nsim');
      expect(response.body.timestamp).toBeDefined();
    });

    it('should return valid ISO timestamp', async () => {
      const response = await request(app).get('/health');

      const timestamp = new Date(response.body.timestamp);
      expect(timestamp.getTime()).not.toBeNaN();
    });
  });

  describe('GET /health/ready', () => {
    it('should return ready status', async () => {
      const response = await request(app).get('/health/ready');

      expect(response.status).toBe(200);
      expect(response.body.status).toBe('ready');
    });

    it('should include dependency checks', async () => {
      const response = await request(app).get('/health/ready');

      expect(response.body.checks).toBeDefined();
      expect(response.body.checks.bsim).toBe('ok');
      expect(response.body.checks.queue).toBe('ok');
    });
  });
});
