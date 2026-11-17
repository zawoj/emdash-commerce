---
name: building-commerce-site
description: Install and wire the stripe-commerce plugin on an EmDash site, model the catalog, call the public HTTP API from a storefront, run cart/checkout/order flows and webhooks, seed a demo catalog, and deploy to production or Cloudflare. Use for EmDash commerce storefront work; use extending-stripe-plugin when changing the plugin package itself.
---

# Building a commerce site on EmDash

This skill describes **`@emdash-commerce/plugin-stripe`** (`stripe-commerce`) and how **`apps/storefront`** in
`emdash-commerce` uses it. For core EmDash (schema, Portable Text, menus), load **`building-emdash-site`** from
`apps/storefront/.agents/skills/`.

## Common gotchas

1. **Plugin id is fixed:** `stripe-commerce`. Never rename it in config, seed or content.
2. **Cart id is a bearer secret.** Plugin routes cannot set cookies — the storefront stores `cartId` (httpOnly cookie via
   its own route and/or `localStorage`) and sends **`x-commerce-cart`** or cookie **`emdash_commerce_cart`** on every cart
   call. See `.ai/memory/emdash-plugin-stripe-cookies.md`.
3. **Amounts are server-derived.** POST bodies send **price ids and quantities only**; never send money from the browser.
4. **The plugin never writes `products` on its own** (revisions would stage drafts). Stripe ids live in plugin storage
   `catalog_links` and display fields on variants/prices — `.ai/memory/emdash-plugin-stripe-draft-staging.md`.
5. **Catalog resync queues; it does not finish instantly.** Background cron syncs 25 links per five minutes; seed and
   admin "Resync" drive it to completion — `.ai/memory/emdash-plugin-stripe-resync-is-slow-by-design.md`.
6. **`EMDASH_ENCRYPTION_KEY`** must be `emdash_enc_v1_` + 43 base64url chars (`pnpm bootstrap` generates one). Hex keys
   break guest order links — `.ai/memory/emdash-encryption-key-format.md`.
7. **Restart once after the first seed** on an empty DB — EmDash reads site URL at startup
   (`.ai/memory/emdash-site-url-is-read-at-startup.md`).
8. **Schema lives in `data.db`.** Mirror admin/MCP changes in `seed/seed.json` and run `npx emdash types` —
   `.ai/memory/emdash-schema-lives-in-the-database.md`.

## Install and register

```bash
# Once @emdash-commerce packages are published to npm:
pnpm add @emdash-commerce/plugin-stripe @emdash-commerce/plugin-image-hotspots @emdash-commerce/design-system
```

In this monorepo, packages are `workspace:*` dependencies of `apps/storefront`.

```js
// astro.config.mjs (simplified)
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
  integrations: [
    emdash({
      database: sqlite({ url: "file:./data.db" }),
      storage: local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
      plugins: [
        {
          id: "stripe-commerce",
          entrypoint: "@emdash-commerce/plugin-stripe",
          options: {
            storeName: "My shop",
            defaultCurrency: "usd",
            supportedCurrencies: ["usd"],
            // Demo leaves off: promotionCodes, shippingRates, automaticTax, embeddedCheckout — see plugin README "Options"
          },
        },
        {
          id: "image-hotspots",
          entrypoint: "@emdash-commerce/plugin-image-hotspots",
          adminEntry: "@emdash-commerce/plugin-image-hotspots/admin",
          fieldWidgets: [{ name: "hotspots", label: "Image with points", fieldTypes: ["json"] }],
        },
      ],
    }),
  ],
});
```

On activation the plugin **reconciles schema** (catalog + sales collections, relations, hidden child collections) and
schedules maintenance cron. It does **not** seed products — your seed script or editors create catalog content.

Read **[references/catalog-and-seed.md](references/catalog-and-seed.md)** for collections, relations and this repo's
`scripts/lib/merch-catalog.mjs` + `pnpm seed`.

## Public HTTP API

Base path: `/_emdash/api/plugins/stripe-commerce/`.

Storefronts import Zod schemas and types from `@emdash-commerce/plugin-stripe/contracts` (no EmDash/Stripe imports).

| Concern | Routes (public unless noted) |
| --- | --- |
| Listing / PDP | `GET catalog/products`, `GET catalog/product?slug=` |
| Cart | `GET cart`, `POST cart/lines`, `PATCH cart/lines`, `DELETE cart/lines` |
| Checkout | `POST checkout` → Stripe Checkout Session URL |
| After pay | Stripe redirects to your success URL; **order is created from webhook only** |
| Guest order | `GET orders/view?token=` (signed link), `POST orders/access-link` (email lookup) |
| Webhook | `POST …/webhook` (Stripe signature on raw body) |

Full route list, error codes and envelopes: `packages/plugin-stripe/docs/api.md` and
**[references/api-and-routes.md](references/api-and-routes.md)**.

## Storefront patterns (this repo)

- **Thin pages, fat features:** `apps/storefront/src/features/{catalog,cart,checkout,orders,home,shell}`.
- **UI only from design system:** map API views to props; never fork markup in the app.
- **Commerce fetch helper:** `utils/commerce-fetch.ts` → plugin API (never legacy `catalog/product-legacy` on new code).
- **Cart cookie:** server route sets httpOnly cookie; client sends header on plugin calls.
- **Guest order:** email contains link to `/orders/view?token=`; invalid token → 404 with link to `/orders/lookup`.
- **Category / brand URLs:** `/shop/c/<slug>` and `/shop/brand/<slug>` redirect into filtered `/shop`.

Detail: **[references/storefront-patterns.md](references/storefront-patterns.md)**.

## Webhooks and orders

Local dev: `stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook` and put the printed
`whsec_…` in `STRIPE_WEBHOOK_SECRET`.

Deployed: register endpoint from Commerce admin or MCP `commerce_webhooks_register`; secret stored encrypted — no
`STRIPE_WEBHOOK_SECRET` env needed.

Pipeline: verify signature → inbox (idempotent by event id) → settlement → order in content → domain events → email
subscriber sends confirmation with view link.

## Seeding and Stripe sync

`pnpm seed` (repo root) uses dev login, loads `scripts/lib/merch-catalog.mjs`, uploads committed PNG art, writes Home
fields, then queues catalog resync when a sandbox key is set.

Requires **dev server running**. Not available on deployed Worker (`import.meta.env.DEV` false).

## Production and Cloudflare

- **Node:** `pnpm build` + `pnpm start`; passkeys for admin; configure email provider for real mail.
- **Cloudflare:** `DEPLOY_TARGET=cloudflare`, D1 + R2, Worker secrets — **[references/production.md](references/production.md)** /
  `docs/cloudflare.md`.

Deploy button on a monorepo subdirectory **does not work** (`workspace:*` siblings). The generated standalone copy
(`pnpm template:cloudflare`, branch `cloudflare-template`, `docs/cloudflare.md`) is what the button points at (not tried with an
account); Workers Builds with repo root + `apps/storefront` is the other option.

## Where to read

| Topic | Path |
| --- | --- |
| Plugin overview | `packages/plugin-stripe/README.md` |
| Architecture | `packages/plugin-stripe/docs/architecture.md` |
| HTTP API | `packages/plugin-stripe/docs/api.md` |
| Extend behaviour | `packages/plugin-stripe/docs/extending.md` + skill `extending-stripe-plugin` |
| Demo storefront routes | `apps/storefront/AGENTS.md` |
| Run locally | `docs/getting-started.md` |
| Agent map | `docs/ai-guide.md` |
| Traps | `.ai/memory/MEMORY.md` (index) |