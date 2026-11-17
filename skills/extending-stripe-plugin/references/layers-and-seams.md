# Layers and extension seams (detail)

## Container

`plugin/container.ts` builds `CommerceContainer` (all ports) per request. Stripe provider is lazy so catalog reads work
without a configured key.

## Domain events

Defined in `core/events.ts`. Written to `event_outbox`; subscribers run with delivery tracking. Built-in
`builtin-emails` subscriber sends transactional mail when `emails.isEnabled` (access-link email has separate path).

## Catalog sync

`services/catalog/sync-*.ts` + `adapters/emdash/catalog-mirror.ts`. Stripe Products for products/variants; Prices for
each sellable. `catalog_links` in plugin storage holds provider ids and drift fingerprints.

## Settlement

Checkout webhook → load session from Stripe → compare to `checkout_snapshots` → create/update order → inventory commit.

Mismatch flags order for review rather than silent drop.

## Storage vs content

Carts, reservations, webhook inbox, record_index: **plugin storage** (atomic updates).

Orders, payments, customers: **content collections** (admin visibility, revisions).

## Extension API surface

`contracts/extensions.ts` types for `CommerceExtensions`. Export helpers from package root for sites that wrap
`createStripeCommercePlugin`.

## Files to touch by task

| Task | Start here |
| --- | --- |
| New public route | `contracts/api.ts`, `plugin/routes/*.ts`, route test |
| New MCP tool | `plugin/mcp.ts`, permissions mirror admin route |
| New order side effect | `services/subscribers/` or site subscriber |
| Stripe API change | `adapters/stripe/`, `WEBHOOK_EVENT_TYPES` |
| New collection field | `adapters/emdash/schema/`, reconciler test |