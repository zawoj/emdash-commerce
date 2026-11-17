---
name: plugin-stripe-runs-on-workerd
description: the stripe-commerce plugin needs no Workers-specific code — fetch client, Web Crypto, process.env filled by nodejs_compat — verified on workerd with a sandbox purchase; what keeps it true
metadata:
  type: project
---

# The Stripe plugin runs on Cloudflare Workers unchanged

Spike result (2026-11-17, workerd 1.20261116.1 through `@astrojs/cloudflare` 14.3.4, local D1/R2, Stripe sandbox):

- **No Node-only code** in `packages/plugin-stripe/src` (no `node:*`, `Buffer`, `require`, `process.*` except one guarded
  `process.env` read). The Stripe SDK gets `Stripe.createFetchHttpClient()` and `createSubtleCryptoProvider()`
  (`adapters/stripe/client.ts`); the access-token HMAC and the idempotency/fingerprint digests use `globalThis.crypto.subtle`;
  base64url uses `btoa`/`atob`. `workers-compat.test.ts` fails if any of that regresses (proved by four mutations).
- **Secrets:** `resolveSecrets` reads the encrypted plugin setting, then `process.env[NAME]`. On Workers `nodejs_compat` with a
  compatibility date >= 2025-04-01 populates `process.env` from the Worker's string vars and secrets, so
  `STRIPE_SECRET_KEY` from `.dev.vars` / `.env` (local) or `wrangler secret put` (deployed) reaches the plugin with no change.
  Drop `nodejs_compat` (or use an older compatibility date) and the fallback is empty. `admin/status` shows
  `isKeyPresent: true` when it works.
- **Proof it is not only unit tests:** catalog sync of 75 Stripe entities, hosted Checkout, a signed webhook verified on
  workerd (`stripe listen` showed `[200]` for each event), order `paid`, and the `commerce-maintenance` cron through the
  Worker's `scheduled` handler.
- **Not covered:** the Workers CPU and subrequest limits under real load, and the order email (no provider outside dev; a
  deployed site needs Settings → Email).
- Setup: `docs/cloudflare.md`; decision `.ai/decisions/2026-11-17-cloudflare-target-switch.md`.
