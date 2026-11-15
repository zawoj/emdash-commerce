---
name: emdash-plugin-stripe-webhook-traps
description: traps hit when real Stripe payments reached the EmDash plugin — error objects are sent as HTTP 200, unindexed filters, routable collections need a slug, record before follow-ups, .env under astro dev; how the 0.2 design answers each
---

# Stripe plugin webhook: traps found with a real sandbox payment (2026-11-12)

All of these passed unit tests with a fake client and only showed up with a real Checkout payment. The 0.2 rewrite
keeps each lesson; where it lives now:

- **A returned error object is sent as HTTP 200.** Stripe then treats the event as delivered and never retries. Routes
  throw `PluginRouteError` (via `CommerceError`, converted only in `plugin/http.ts`); the webhook route answers 503 (no
  secret), 400 (bad signature), 500 (handling failed) so Stripe retries.
- **Content filters need indexed fields** (`fieldFilters` throws for a custom field without `indexed: true`, and
  `applySeed` with `skip` never adds the index). Lookups by Stripe id therefore use the plugin's `record_index`
  storage (`order:session:<id>`, `payment:pi:<id>`, ...), claimed with `compareAndSet`, never content filters.
- **Collections are routable by default** and publishing without a slug fails; `content.create` from a plugin cannot set
  a slug and rejects a `slug` key. Plugin-owned collections are `routable: false` in the definitions.
- **Record the record before the follow-ups.** Settlement creates the order, indexes it, then runs idempotent
  follow-ups that every retry repeats; a failure there never releases the claim or creates a second order.
- **`astro dev` does not put `apps/storefront/.env` into `process.env`:** `dev`/`start` run through
  `node --env-file-if-exists=.env`. Saving secrets in the admin needs `EMDASH_ENCRYPTION_KEY`.
- Verify with `stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook` and
  `stripe events resend <evt_id>` (replays the real event, signature included); the inbox dedupes by event id and the
  admin page can replay a stored event.

More traps and the extension map: [[emdash-plugin-stripe-extending]].
