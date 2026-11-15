---
name: emdash-plugin-stripe-idempotency
description: Stripe idempotency keys must come from record ids and versions, never random, and must change with the intent — Stripe replays a key's response for 24 hours
---

# EmDash Stripe plugin — idempotency keys

Stripe replays the response of an idempotency key for **24 hours** and rejects the same key with different parameters
(`StripeIdempotencyError`). So a key must be deterministic (a retry of the same attempt reuses it) and must change when
the intent changes. The prototype's fixed suffixes (`product:update`, `price:create`, `checkout:<cartId>`) broke the
second publish and the second checkout.

Current keys (all `stripe-commerce:<op>:...`, `services/catalog/idempotency.ts` and the services):

- product create: entity key; price create: price id + short hash of the terms fingerprint;
- product/price **update, archive, reactivate**: entity (or Stripe id) + the link's **`syncVersion`** + hash of the
  payload. `markPending` bumps the version for every new intent, so archive → reactivate → archive never replays an
  earlier answer, while a retry of one attempt keeps its key;
- checkout session: `checkout:<checkoutId>` (fresh id per attempt, stored in the snapshot);
- refund: `refund:<refundId>` where the id is `rf_` + hash(orderId, requestId) — the caller's `requestId` makes a
  repeat the same refund; subscription cancel: per subscription and target; webhook endpoint: hash of URL + events.

The checkout `integration_identifier` is stable per site (one suffix in plugin KV), not per session. Rules and the
list of places: `packages/plugin-stripe/docs/extending.md` (section 5) and [[emdash-plugin-stripe-extending]].
