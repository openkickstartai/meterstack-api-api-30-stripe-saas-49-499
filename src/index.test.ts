import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { MeterStack, InMemoryStore } from './index';

function createApp(plans: Record<string, { requestsPerMonth: number; ratePerMinute: number }>) {
  const meter = new MeterStack({ plans });
  const app = express();
  app.use(meter.middleware());
  app.get('/data', (_req, res) => res.json({ ok: true, meter: (_req as any).meterstack }));
  return { app, meter };
}

describe('MeterStack Middleware', () => {
  it('rejects requests without an API key with 401', async () => {
    const { app } = createApp({ free: { requestsPerMonth: 100, ratePerMinute: 50 } });
    const res = await request(app).get('/data');
    expect(res.status).toBe(401);
    expect(res.body.error).toContain('API key');
  });

  it('allows valid API key and attaches meterstack context', async () => {
    const { app } = createApp({ pro: { requestsPerMonth: 10000, ratePerMinute: 100 } });
    const res = await request(app).get('/data').set('x-api-key', 'pro_cust123');
    expect(res.status).toBe(200);
    expect(res.body.meter.customerId).toBe('cust123');
    expect(res.body.meter.plan).toBe('pro');
    expect(res.body.meter.usage).toBe(1);
    expect(res.headers['x-quota-used']).toBe('1');
  });

  it('returns 403 for unknown plan', async () => {
    const { app } = createApp({ free: { requestsPerMonth: 100, ratePerMinute: 50 } });
    const res = await request(app).get('/data').set('x-api-key', 'gold_cust1');
    expect(res.status).toBe(403);
    expect(res.body.error).toContain('gold');
  });

  it('enforces per-minute rate limit with 429 and Retry-After', async () => {
    const { app } = createApp({ free: { requestsPerMonth: 9999, ratePerMinute: 2 } });
    const key = 'free_ratelimituser';
    await request(app).get('/data').set('x-api-key', key);
    await request(app).get('/data').set('x-api-key', key);
    const res = await request(app).get('/data').set('x-api-key', key);
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Rate limit');
    expect(res.headers['retry-after']).toBe('60');
  });

  it('enforces monthly quota and returns usage details', async () => {
    const { app } = createApp({ free: { requestsPerMonth: 3, ratePerMinute: 100 } });
    const key = 'free_quotauser';
    for (let i = 0; i < 3; i++) {
      const r = await request(app).get('/data').set('x-api-key', key);
      expect(r.status).toBe(200);
    }
    const res = await request(app).get('/data').set('x-api-key', key);
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('quota');
    expect(res.body.usage).toBe(4);
    expect(res.body.limit).toBe(3);
  });

  it('getUsage returns current monthly count', async () => {
    const { app, meter } = createApp({ free: { requestsPerMonth: 100, ratePerMinute: 100 } });
    await request(app).get('/data').set('x-api-key', 'free_usagecheck');
    await request(app).get('/data').set('x-api-key', 'free_usagecheck');
    const usage = await meter.getUsage('usagecheck');
    expect(usage).toBe(2);
  });
});
