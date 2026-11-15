---
name: emdash-plugin-stripe-admin-carts
description: the authoritative cart is plugin storage commerce_carts; the carts collection is a best-effort admin mirror found through record_index; cart_status field; the schema reconciler adds it to existing sites
---

# Stripe plugin: the admin `carts` collection

- **Source of truth:** plugin storage `commerce_carts` (lines, status, checkout claim, expiry), addressed by the bearer
  cart id. The **`carts`** content collection (slug configurable, `options.collections.carts`) is a **mirror for admin
  visibility only** and is written best effort (a failure is logged, never fails a cart call).
- **Lookups:** `record_index` key `cartmirror:<cartId>` → the mirror entry's content id, so two concurrent upserts cannot
  create two entries. Do not filter the collection by custom fields (unindexed-filter trap, see
  [[emdash-plugin-stripe-webhook-traps]]).
- **Status field:** `cart_status` (not `status`, EmDash's publish column): `active`, `checkout_open`, `converted`,
  `abandoned`, `expired`. The mirror holds lines, priced lines, subtotal, currency, checkout session id, order id,
  `country` and `user_agent`; **no IP** is stored.
- **Create:** `content.create` on a non-routable collection (no slug); `slug` in the data is rejected.
- **Existing installs:** the additive schema reconciler (install/activate and first use) creates the collection and
  adds missing fields; `applySeed` is no longer involved. Expired and converted carts are deleted from storage 7 days
  after their last update by the cart sweep; their **mirror entries are never deleted** (the collection only grows).

Cart contract: `packages/plugin-stripe/docs/api.md`; map of the plugin: [[emdash-plugin-stripe-extending]].
