import type { Request, Response, NextFunction } from 'express';
import { InMemoryStore, UsageStore } from './store';

export type { UsageStore } from './store';
export { InMemoryStore } from './store';
export { createQuotaMiddleware, MemoryQuotaStore } from './quota';
export type { Plan, QuotaUsageStore, QuotaCheckResult, QuotaMiddlewareOptions } from './quota';


export interface PlanConfig {
  requestsPerMonth: number;
  ratePerMinute: number;
}

export interface CustomerInfo {
  customerId: string;
  plan: string;
}

export interface MeterStackOptions {
  plans: Record<string, PlanConfig>;
  store?: UsageStore;
  stripeSecretKey?: string;
  stripeMeterEventName?: string;
  resolveCustomer?: (req: Request) => CustomerInfo | null;
}

export class MeterStack {
  private plans: Record<string, PlanConfig>;
  private store: UsageStore;
  private stripeKey?: string;
  private meterEvent: string;
  private resolve: (req: Request) => CustomerInfo | null;

  constructor(opts: MeterStackOptions) {
    this.plans = opts.plans;
    this.store = opts.store || new InMemoryStore();
    this.stripeKey = opts.stripeSecretKey;
    this.meterEvent = opts.stripeMeterEventName || 'api_requests';
    this.resolve = opts.resolveCustomer || MeterStack.defaultResolver;
  }

  private static defaultResolver(req: Request): CustomerInfo | null {
    const key = (req.headers['x-api-key'] as string) || '';
    const idx = key.indexOf('_');
    if (idx < 1) return null;
    return { plan: key.slice(0, idx), customerId: key.slice(idx + 1) };
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const cust = this.resolve(req);
      if (!cust) return res.status(401).json({ error: 'Invalid or missing API key' });

      const plan = this.plans[cust.plan];
      if (!plan) return res.status(403).json({ error: `Unknown plan: ${cust.plan}` });

      const rateCount = await this.store.increment(`rate:${cust.customerId}`, 60);
      if (rateCount > plan.ratePerMinute) {
        res.set('Retry-After', '60');
        return res.status(429).json({ error: 'Rate limit exceeded', retryAfter: 60 });
      }

      const month = new Date().toISOString().slice(0, 7);
      const quotaCount = await this.store.increment(`quota:${cust.customerId}:${month}`, 2678400);
      if (quotaCount > plan.requestsPerMonth) {
        return res.status(429).json({ error: 'Monthly quota exceeded', usage: quotaCount, limit: plan.requestsPerMonth });
      }

      res.set('X-RateLimit-Remaining', String(Math.max(0, plan.ratePerMinute - rateCount)));
      res.set('X-Quota-Used', String(quotaCount));
      (req as any).meterstack = { ...cust, usage: quotaCount };

      if (this.stripeKey) this.reportStripe(cust.customerId).catch(() => {});
      next();
    };
  }

  private async reportStripe(customerId: string) {
    const Stripe = (await import('stripe')).default;
    const client = new Stripe(this.stripeKey!);
    await client.billing.meterEvents.create({
      event_name: this.meterEvent,
      payload: { stripe_customer_id: customerId, value: '1' },
    });
  }

  async getUsage(customerId: string): Promise<number> {
    const month = new Date().toISOString().slice(0, 7);
    return this.store.get(`quota:${customerId}:${month}`);
  }
}
