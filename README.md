# ⚡ MeterStack

**Add usage-based billing to any API in 5 minutes.** Drop-in Express middleware that handles API key auth, request metering, quota enforcement, and Stripe usage reporting.

```
npm install meterstack
```

## 🚀 Quick Start

```typescript
import express from 'express';
import { MeterStack } from 'meterstack';

const app = express();

const meter = new MeterStack({
  plans: {
    free:  { requestsPerMonth: 1000,  ratePerMinute: 10  },
    pro:   { requestsPerMonth: 50000, ratePerMinute: 200 },
  },
  stripeSecretKey: process.env.STRIPE_SECRET_KEY, // optional
});

app.use('/api', meter.middleware());
app.get('/api/data', (req, res) => res.json({ ok: true }));
app.listen(3000);
```

Clients authenticate with `x-api-key: <plan>_<customerId>` header. Override with `resolveCustomer` for production use.

## 📊 Why Pay for MeterStack?

| Pain Point | Without MeterStack | With MeterStack |
|---|---|---|
| Billing integration | Weeks of Stripe plumbing | 5 minutes |
| Rate limiting | Build from scratch | Built-in sliding window |
| Quota tracking | Custom DB queries | Automatic per-customer |
| Usage dashboards | Build your own | Pro: ready-made UI |
| Multi-tenant isolation | Architecture headache | Enterprise: turnkey |

## 💰 Pricing

| Feature | Free (OSS) | Pro $49/mo | Enterprise $499/mo |
|---|---|---|---|
| Request metering | ✅ | ✅ | ✅ |
| Rate limiting (429 + Retry-After) | ✅ | ✅ | ✅ |
| Monthly quota enforcement | ✅ | ✅ | ✅ |
| Stripe Meter reporting | ✅ | ✅ | ✅ |
| In-memory store | ✅ | ✅ | ✅ |
| Redis / PostgreSQL store | ❌ | ✅ | ✅ |
| Usage dashboard UI | ❌ | ✅ | ✅ |
| Customer self-serve portal | ❌ | ✅ | ✅ |
| API key management & rotation | ❌ | ✅ | ✅ |
| Webhook event log | ❌ | ✅ | ✅ |
| Multi-tenant isolation | ❌ | ❌ | ✅ |
| RBAC & audit trail | ❌ | ❌ | ✅ |
| SSO (SAML/OIDC) | ❌ | ❌ | ✅ |
| Priority support & SLA | ❌ | Email | Dedicated Slack |

## 🔧 Custom Customer Resolver

```typescript
const meter = new MeterStack({
  plans: { free: { requestsPerMonth: 1000, ratePerMinute: 10 } },
  resolveCustomer: (req) => {
    const row = db.findByApiKey(req.headers['x-api-key']);
    return row ? { customerId: row.stripeId, plan: row.plan } : null;
  },
});
```

## 📡 API Response Headers

Every response includes usage headers:
- `X-RateLimit-Remaining` — requests left this window
- `X-Quota-Used` — monthly usage count
- `Retry-After` — seconds to wait (on 429)

## License

MIT — free core forever. Pro/Enterprise features require a license key.
