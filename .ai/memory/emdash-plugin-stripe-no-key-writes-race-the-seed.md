---
name: emdash-plugin-stripe-no-key-writes-race-the-seed
description: two post-save races made the Cloudflare e2e flaky (D1 409 CONFLICT in the seed, a product page with disabled options) - a keyless sync wrote failed into every saved row, and the product-wide managed-price lock queued variant hooks past EmDash's 5 s hook timeout; hooks must not write for a missing setting and must not queue behind one lock
metadata:
  type: project
---

# Post-save hooks racing the seed (Cloudflare e2e flakes, 2026-11-17)

`content:afterSave` runs after the response (EmDash `after()` -> `waitUntil` on workerd) under a **5000 ms hook timeout**
(`HookTimeoutError`, `executeWithTimeout` in emdash `plugins/hooks.ts`: a `Promise.race`, the hook is not cancelled). A seed that
saves 20 variants in a row therefore runs 20 hooks at once. Two things in them raced the seed; neither is new, a loaded machine
only made them likelier (about 1 run in 5 failed), so the suite looked "regressed" after unrelated merges. No commit between
`a9f26e0` and `ee25fbf` touched this path.

1. **A missing Stripe key wrote into every saved row.** The sync threw `notConfigured` and `finishFailure`
   (`services/catalog-sync.ts`) wrote `stripe_sync_status = failed` into the price or variant that had just been saved (67 prices
   and 52 variants after one keyless seed). The seed published or edited the same row at once; on D1 the publish is an optimistic
   batch and EmDash answers `409 CONFLICT "Content changed while the operation was in progress"`. Fix: no content write for a
   `notConfigured` error; the link still records the failure and its backoff. A real Stripe error still writes `failed`.
2. **One lock per product for the managed prices.** Every variant hook took `lock:managed-prices:<productId>`, so 20 hooks queued
   behind one another; the late ones hit the 5 s timeout, were abandoned (workerd then cancels their I/O), their variant never
   got a managed price (nothing retries it) and the lock row stayed claimed for the 5 minute stale window. Symptom: the product
   page rendered with "XL" and "White" radios `disabled`, `.check()` waited until the 45 s test timeout (or the default variant was
   not the first one). Found in a captured failing D1: 4 of 20 variants of `workers-tee` without a price edge and a leftover
   `lock:managed-prices:<id>` in `_plugin_storage` `record_index`. Fix: `LOCK_KEY.managedPrice(sellableId)`, one lock per
   product/variant, read again inside it (`services/catalog/managed-prices.ts`).

Rules: a content hook never writes a content row because a setting is missing; never serialise the hooks of one entity type behind
a single lock; keep a hook well inside 5 s. How to look: copy `.e2e-cloudflare/state/v3/d1/.../*.sqlite` of a failed run and
query `ec_prices`, `_emdash_content_references` and `_plugin_storage` (`record_index` rows with a null `recordId` are held locks).
Still possible: a hook that does time out loses its work (there is no managed-price retry in cron) - that is the open follow-up.
