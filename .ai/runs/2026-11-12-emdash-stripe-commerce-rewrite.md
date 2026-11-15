# EmDash Stripe commerce plugin rewrite (multi-agent run)

Date: 2026-11-12 · Task: none (scope agreed in the session) · Lead: Claude Code (Opus 5.5)

## Goal

Rewrite `packages/plugin-stripe` into a backend-only, extensible commerce backend for EmDash on
Stripe (no storefront work beyond keeping `apps/storefront` working): catalog with variants, many prices and
inventory, carts, hosted + embedded Checkout, orders, payments, refunds, disputes, subscriptions and
invoices, guest access tokens, a durable webhook inbox, a domain-event outbox, admin + MCP operations.
Decisions: `.ai/decisions/2026-11-12-emdash-stripe-commerce-architecture.md`.

## Steps

1. Research (3 Sonnet agents): Payload `plugin-stripe` + `plugin-ecommerce`, Strapi Stripe plugins + Medusa's
   payment provider, EmDash 1.5 native-plugin capabilities (from `emdash/src`).
2. Lead: ADR, contracts (`src/core`, `src/ports`, `src/contracts`, `src/services/contracts.ts`) and the fake
   provider (`src/testing/fake-provider.ts`).
3. Phase 1 (Sonnet ×2, parallel, file ownership): foundation (domain, in-memory ports, EmDash adapters,
   schema reconciler, plugin skeleton) · Stripe adapter (API `2026-10-28.endive`, fixtures from the sandbox).
4. Phase 2 (parallel): catalog sync (Composer 2.5) · cart/checkout/inventory (Sonnet) · webhooks,
   settlement, payments, refunds, disputes, subscriptions, customers, outbox, tokens (Sonnet).
5. Lead review found two catalog defects (idempotency keys repeating across intents; Stripe writes on every
   checkout) → Phase 3 (Sonnet ×2): catalog hardening + wiring · admin routes, MCP tools, Block Kit page,
   cron, emails, guest order routes.
6. Lead fixes: mailer error semantics, archive of deleted variants/prices/products by catalog link
   (`CatalogProvider.archiveProduct`), webhook re-register keeps dashboard events, skipped Checkout options
   logged, dead shim removed.
7. Phase 4 (parallel): storefront adapted to the new API (Composer 2.5) · docs + memory + changelogs (Sonnet).
8. Lead live E2E on the Stripe sandbox (app on port 4361, `stripe listen` forwarding), local commerce data
   backed up, old collections deleted through the schema API, demo catalog seeded through the content API.

## Verification

- Package: 55+ test files, 966 tests green; every critical guard mutation-checked (matrices in the agents'
  reports; lead-added guards: archive-deleted ×3, mailer, schema-port existence, dispute/refund race ×2).
- Repo gate: `pnpm typecheck`, `pnpm test` (7 projects), build of `emdash` + `emdash-plugin-stripe`,
  `pnpm check:ai` green; full `pnpm build` run at the end.
- Live (Stripe sandbox account): catalog synced to Stripe (5 products, 5 prices, ids mirrored on
  variants/prices); hosted checkout paid with 4242 → order `ORD-2026-63ED3E` paid, payment, customer
  aggregates, variant stock 3→2 in storage and content; subscription with 7-day trial → order + subscription
  `trialing`; partial refund via `admin/orders/refund` (same `requestId` → same refund, over-refund 409) →
  `partially_refunded`; dispute card 0259 → `disputed` (after the race fix + `admin/webhooks/replay`);
  `stripe events resend` → no duplicate order; price edit 29→34 zł → new Stripe price, old archived,
  `lookup_key` transferred; unpublish → Stripe product and price archived; subscription cancel at period
  end; expired abandoned sessions → reservations released (Black 1 → 5 available).

## Outcome

Done. Three defects were found only by the live run and fixed with tests: the variant stock hook read
fields from the wrong level of the afterSave event; the schema port treated `COLLECTION_EXISTS` from an
unfinished deletion as success; refunds/disputes that race ahead of settlement were ignored for good.

## Follow-ups

- Hosted success URL uses the configured site URL (`localhost:4360` locally); the E2E ran on 4361 with the
  status read from the API — run the storefront once on 4360 before showing it.
- Known gaps listed in `packages/plugin-stripe/README.md` (Limitations) and the docs agent's report:
  services importing adapters directly, `order.cancelled` not emitted, cart mirror entries not purged,
  timing side channel on `orders/access-link`, no batch catalog read for archive pages.
- Nothing is committed; the old 0.1 data model is gone from the local DB (backed up outside the repo).
