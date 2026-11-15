# EmDash Stripe commerce: a layered, provider-neutral commerce backend

Date: 2026-11-12 · Task: none (scope agreed in the session that started the rewrite)

## Context

`packages/plugin-stripe` grew from a prototype: one 500-line plugin file, one price per
product, orders created from `checkout.session.completed` only, no customers, payments, refunds,
disputes or invoices, no extension points, Stripe SDK calls mixed into hooks and routes. It now has
to become a full commerce backend for EmDash sites (no storefront: sites build their own), built on
foundations that others can extend.

What we learned from existing CMS integrations:

- **Payload** `plugin-ecommerce` gets settlement right (server-side price authority, strict
  validation of the payment against the cart, a CAS claim so one order is created) but creates the
  order only when the browser calls `confirm-order`, handles no refunds or subscriptions, does not
  dedupe webhook events, and puts the cart into PaymentIntent metadata (breaks at ~8 lines).
  `plugin-stripe` shows two-way sync with a loop guard and an allowlisted REST proxy.
- **Strapi** Stripe plugins record payments from a public GET on the success page, without webhooks
  or dedupe — the pattern to avoid. Strawbinary's plugin shows a good webhook route (503/400/500
  semantics) and catalog resync by cron.
- **Medusa** has the cleanest abstraction: a payment-provider interface, a small normalised action
  vocabulary for webhooks, idempotency keys derived from own record ids, webhooks processed through a
  queue with retries.

EmDash 1.5 constraints (verified in `emdash/src`): no event bus or custom hooks, no customer
accounts, plugin routes cannot set cookies, a returned error object is HTTP 200 (status needs
`PluginRouteError`), no multi-document transactions (single-row `compareAndSet` / `updateIf` only),
`content:after*` hooks run after the response with errors only logged, no plugin upgrade hook, and
`applySeed` with `skip` never adds fields to an existing collection.

## Decision

1. **Layers.** `core/` (pure domain: money, catalog, cart pricing, order/payment/subscription state,
   domain events, errors) → `ports/` (repository and payment-provider interfaces) → `services/`
   (use cases on ports) → `adapters/emdash` (content + plugin storage) and `adapters/stripe` (the
   only importer of the `stripe` SDK) → `plugin/` (EmDash wiring: routes, hooks, cron, MCP, admin).
   Contracts that consumers depend on live in `contracts/` (options, HTTP API, extensions).
2. **One source of truth per kind of data.** Catalog: EmDash content; Stripe mirrors it, drift made
   in the Stripe dashboard is detected and reported, never written back (no sync loop). Payment
   state: provider events only (webhook or reconciliation), never the browser.
3. **Catalog model = Stripe model.** Products, variants (each a Stripe Product) and prices (many per
   product or variant, one-time or recurring). A cart line is a price id. Stripe prices are immutable,
   so a terms change creates a new price and archives the old one, reusing a previous price when the
   terms return.
4. **Inventory in plugin storage** with guarded `updateIf`, reserved when a Checkout Session is
   created (session lifetime = reservation lifetime), committed on payment, released on expiry or
   failure. The content field is a mirror; an editor's edit becomes a delta.
5. **Durable webhook inbox**: verify the raw body → record once by event id → process with a lease →
   idempotent handlers → on failure 500 (Stripe retries) plus cron retries with backoff, then `dead`
   for manual replay. Reconciliation from `events.list` closes gaps after downtime.
6. **Settlement** retrieves the session from Stripe and compares it with a server-side checkout
   snapshot (never metadata blobs). Mismatches flag the order for review instead of dropping a paid
   order. Exactly-once by a claim on the session id; follow-up steps are idempotent so a retry
   completes a half-done settlement.
7. **Domain events through a storage outbox** with per-subscriber delivery state — the extension
   surface EmDash does not provide. Site extensions are passed through a site-owned plugin
   entrypoint, because descriptor options are JSON-only.
8. **Guest identity** by normalised email → one Stripe Customer; order access and the Stripe Customer
   Portal through HMAC-signed, expiring tokens sent by email.
9. **Read-only money fields**: a `content:beforeSave` guard rejects editor changes to financial and
   Stripe fields; the plugin writes them through the content API, which bypasses hooks.
10. **Schema evolution** by an additive schema reconciler (missing collections and fields) run on
    activation and lazily on first use, plus numbered, run-once data migrations behind a KV lock.

## Alternatives considered

- **Keep extending the prototype** — rejected: no seams to test or extend, and every new event type
  added more Stripe calls to the plugin file.
- **Two-way catalog sync (Payload `plugin-stripe`)** — rejected: needs a loop guard on every write,
  and editors would lose changes made in EmDash when someone edits in Stripe.
- **PaymentIntents + Payment Element** — not now: Checkout Sessions cover hosted and embedded UIs,
  subscriptions, promotion codes, tax and address collection with one backend path.
- **Orders in plugin storage only** — rejected: editors need orders in the admin; content gives
  listing, search and revisions for free. Machine state (inbox, outbox, inventory, indexes) stays in
  storage.

## Consequences

- More files and an explicit port layer; in-memory port implementations make service tests fast and
  exercise the same CAS rules as production.
- Breaking change for the prototype's data model; local test data is wiped and reseeded.
- A site that needs extensions owns a three-line entrypoint file.
- How to extend the plugin is in `.ai/memory/emdash-plugin-stripe-extending.md` and the package
  `docs/`.
