# Catalog model and seeding

## Content collections (plugin-reconciled)

**Catalog folder:** Products, Product types, Attributes, Brands, Categories. Variants, prices, attribute values are
**hidden** children edited from parents.

**Sales folder:** Orders, Customers, Subscriptions, Commerce admin page. Payments, order_events, carts mirrored or hidden.

Relations are native EmDash relations (not raw id fields in the storefront).

## Product model (v2)

- Product type defines up to **three variant axes** (e.g. size × colour).
- Each variant = one Stripe Product; prices mirrored one-way to Stripe.
- Bundles = fixed-price products with specification "includes"; membership = recurring price + trial.
- Managed price per sellable + optional extra prices.

Orders have **three axes**: `order_status`, `payment_status`, `fulfillment_status`; timeline in hidden `order_events`.

ADR: `.ai/decisions/2026-11-13-emdash-commerce-catalog-relations-and-orders.md`.

## This repo's seed

| Piece | Location |
| --- | --- |
| Schema + site shell | `apps/storefront/seed/seed.json` |
| Catalog data | `scripts/lib/merch-catalog.mjs` |
| Runner | `scripts/seed-demo.mjs` (`pnpm seed`) |
| Art | `scripts/art/` → `apps/storefront/public/merch/` (`pnpm art`) |

Seed flow: dev-bypass login → apply schema → create/update entities by slug → queue `admin/catalog/sync` and poll until
done (when `STRIPE_SECRET_KEY` set).

**Production:** `pnpm seed` cannot run on deployed site. Use admin, MCP, or `emdash site export` / `import` then
**resync catalog** — export does not carry `catalog_links` Stripe ids (`docs/production.md`).