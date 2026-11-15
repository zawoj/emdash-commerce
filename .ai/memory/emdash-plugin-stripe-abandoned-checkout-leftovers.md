---
name: emdash-plugin-stripe-abandoned-checkout-leftovers
description: An unpaid checkout released its stock but left a snapshot, a released reservation and a cart behind forever - the checkout-sweep step removes them; what it must never touch
---

# Abandoned checkouts left records behind

`checkout.session.expired` (delivered by `stripe listen` or a real webhook) and the `reservation-expiry` cron step
release the stock and reopen the cart, but both only change a status. The checkout snapshot, the `released`
reservation document and the cart stayed in plugin storage for good (only expired/converted carts had a purge).

- `services/checkout-sweep.ts` (cron step `checkout-sweep`, admin button, `commerce_checkouts_sweep`) removes them after
  `sessionMinutes + checkout.abandonedRetentionHours` (default 48 h).
- Why 48 h and not minutes: an async payment method can settle after the session ended; settlement needs the snapshot
  (else the order is flagged `missing_snapshot`) and a released reservation record (else the late stock decrement is
  skipped, see `commitOrderStock`). `retentionHours: 0` is for dev and QA only.
- Never sweep a session the provider reports `complete`: its webhook may still be in the inbox. Never touch committed
  reservations (they belong to an order) or a snapshot with an order before 30 days.
- "Ended" means the snapshot's stored `expiresAt` (older snapshots: `createdAt` + `sessionMinutes`). A session expired
  early through the Stripe API is released at once by its webhook but its `expiresAt` is still in the future, so only
  `retentionHours: 0` (provider says closed) sweeps it before then. Released reservation records are purged by release
  time, not by the hold's expiry, for the same reason.
- A snapshot is written before its session, and a failed creation (for example `NOT_CONFIGURED`) releases the hold but
  leaves the snapshot with `sessionId: null`; the sweep treats it as ended 10 minutes after it was written.
- A scan of old snapshots must page (`listCreatedBefore(before, limit, after)`): paid snapshots stay, so a single
  oldest-first page would hide the unpaid ones behind them.
- `checkout_snapshots` needed a `createdAt` index in `storage/declaration.ts`; a `where`/`orderBy` on an undeclared
  field throws.
