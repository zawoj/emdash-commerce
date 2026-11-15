# @emdash-commerce/plugin-stripe

Backend-only commerce for [EmDash](https://github.com/emdash-cms/emdash) on Stripe. A native EmDash plugin that
owns the catalog sync, carts, Stripe Checkout Sessions, orders, payments, refunds, disputes, subscriptions, guest
customers and a durable webhook pipeline. It has **no storefront**: a site renders its own pages and talks to the
plugin over a small public HTTP API (`docs/api.md`) and reacts to domain events (`docs/extending.md`).

Version 0.2.0 is a rewrite of the 0.1 prototype and breaks its data model, routes and exports; the unreleased
"catalog v2" change on top of it (native relations, product types and attributes, three-axis orders) breaks the 0.2
data model again (see `CHANGELOG.md`). Design rationale (repo root):
`.ai/decisions/2026-11-12-emdash-stripe-commerce-architecture.md` and
`.ai/decisions/2026-11-13-emdash-commerce-catalog-relations-and-orders.md`. Internals: `docs/architecture.md`.

## What it does

- **Catalog.** A product model of attributes (and their values), product types (up to three variant axes plus a
  specification), brands, a category tree, products and variants (exactly one value per axis, each variant its own
  Stripe Product). A product carries a base price and a variant may override it; the plugin mirrors that amount into a
  managed `prices` entry per sellable, and an editor can add further prices (one-time or recurring, any supported
  currency). Every link between collections is a native EmDash relation, so the admin shows entry pickers instead of
  raw ids. EmDash content is the source of truth; the plugin mirrors it to Stripe, never the other way round. Stripe prices are immutable, so a terms change creates a new Stripe Price and
  archives the old one; a revert reuses the earlier one. Drift made in the Stripe dashboard is detected and reported
  (`catalog.drift_detected`), never written back.
- **Inventory.** Per product or variant, in plugin storage with guarded atomic updates. Stock is reserved when a
  Checkout Session is created (session lifetime = reservation lifetime), committed on payment, released on expiry
  or failure.
- **Carts.** Server-side, addressed by an unguessable bearer id. The client sends price ids and quantities only;
  amounts, currency and checkout mode are derived on the server.
- **Checkout.** Hosted and embedded Stripe Checkout Sessions, one-time and subscription mode, promotion codes,
  fixed shipping rates (payment mode), phone and address collection, optional Stripe Tax, trials. A double click
  returns the same open session.
- **Orders and payments.** Created from provider events only (webhook or reconciliation), never from the browser.
  Settlement retrieves the session from Stripe and checks it against a server-side snapshot; a mismatch flags the
  order for review instead of dropping a paid order. An order has three status axes (lifecycle `order_status`,
  provider-driven `payment_status`, `fulfillment_status`), a snapshot of its lines, an append-only timeline (a panel
  in the order editor) and a sequential number (`orders.numberFormat`).
- **Refunds and disputes.** Full or partial refunds through the admin route or MCP, safe to repeat; refunds and
  disputes made in the Stripe dashboard are picked up from events.
- **Subscriptions and invoices.** Mirrored from Stripe, renewals recorded as payments, cancel from the admin.
- **Guest customers.** Identified by email, no accounts. A buyer opens an order or the Stripe Customer Portal
  through an HMAC-signed, expiring link sent by email.
- **Webhook inbox.** Verify the raw body, record once by event id, process under a lease, retry with backoff, park
  as `dead`, replay by hand; cron reconciliation closes gaps after downtime.
- **Domain events.** A durable outbox with per-subscriber delivery state: the extension surface a site uses to react
  to `order.paid`, `order.refunded`, `cart.abandoned`, `inventory.low_stock` and more.
- **Editor tools.** Block Kit panels on the product (Variants generator, Specification) and on the order (Timeline with
  lifecycle actions, fulfillment and notes), a "Sync to Stripe" action, and a publish guard that refuses to publish an
  incomplete product with a readable reason.
- **Storefront read API.** Listing cards and a full product page (axes, variants with prices and availability, specs,
  related products), media-library images resolved to public URLs.
- **Operations.** A Block Kit admin page ("Commerce"), 17 MCP tools, one maintenance cron task.
- **Transactional email** (order confirmation, payment failed, refund, access link) through EmDash's email
  provider, with replaceable renderers.

## Install and wire

The package is a workspace dependency of `apps/storefront`. Register it in `astro.config.mjs`:

```js
emdash({
  plugins: [
    {
      id: "stripe-commerce",
      entrypoint: "@emdash-commerce/plugin-stripe",
      // Optional. Options travel as JSON, so only serialisable values fit here (see "Configuration").
      options: { storeName: "My shop", defaultCurrency: "eur", supportedCurrencies: ["eur", "usd"] },
    },
  ],
});
```

EmDash imports `createPlugin` from the entrypoint and calls it with the options. Options are validated with zod at
startup; a bad option stops the site with a readable message (`Invalid stripe-commerce plugin options: …`).

### With extensions

Functions (subscribers, `validateCart`, email renderers, …) cannot pass through JSON options. A site that needs
them points the descriptor at its own entrypoint instead:

```ts
// src/commerce/plugin.ts — the site's plugin entrypoint
import { createStripeCommercePlugin } from "@emdash-commerce/plugin-stripe";
import { extensions } from "./extensions"; // defineCommerceExtensions({ subscribers, validateCart, ... })
export const createPlugin = (options: Parameters<typeof createStripeCommercePlugin>[0]) => createStripeCommercePlugin(options, extensions);
```

```js
plugins: [{ id: "stripe-commerce", entrypoint: "<module that resolves to the file above>", options: { /* ... */ } }],
```

The entrypoint must be a module specifier the site's bundler can resolve (EmDash imports it from a virtual module), for
example a small workspace package or an alias; this repo's `apps/storefront` does not use extensions yet.

(`createStripeCommercePlugin(options?, extensions?, deps?)`; the third argument is for tests.) See `docs/extending.md`.

On install/activate and lazily on first use the plugin runs its schema reconciler (a layer over EmDash's `applySeed`):
it creates the collections, relations and fields that are missing and keeps everything that already exists, so an
editor's customisations survive an upgrade; then it runs numbered data migrations. In the admin sidebar the visible
collections sit in two folders under Content: **Catalog** (Products, Product types, Attributes, Brands, Categories) and
**Sales** (Orders, Customers, Subscriptions, then the Commerce page). Variants, prices, attribute values, payments, order
events and carts are `hidden` collections: they are edited from their parent (a variant from its product, a value from
its attribute, a payment and the timeline from the order) and stay reachable by URL. A collection an admin has already
moved (any folder or position) keeps its place and visibility. It also schedules its maintenance cron task. Nothing is
seeded; the catalog is created by editors (or a site's own seed, which must create links through EmDash's relation
seed support, see `docs/extending.md`).

Capabilities the plugin declares: `content:read`, `content:write`, `content:publish`, `content:revisions:read`,
`email:send`, `hooks.content-policy:register` (the product publish guard).

## Configuration

### Secrets

Secrets live in EmDash's encrypted plugin settings (**Plugins → Stripe commerce → Settings**), with environment
variables as fallback. A value saved in the admin wins over the environment, so a key can be rotated without a deploy.

| Setting | Env fallback | Notes |
| --- | --- | --- |
| `stripeSecretKey` | `STRIPE_SECRET_KEY` | A restricted key (`rk_…`) is recommended (see the checklist below). |
| `stripeWebhookSecret` | `STRIPE_WEBHOOK_SECRET` | `whsec_…`. Filled automatically by "Register webhook" on creation. |
| `accessTokenSecret` | `COMMERCE_ACCESS_TOKEN_SECRET` | Signs guest order links. Generated on first activation; changing it invalidates links already sent. |

Saving a secret in the admin (and the generated access-token secret) needs **`EMDASH_ENCRYPTION_KEY`** (32-byte hex,
`openssl rand -hex 32`). Without it the settings cannot be written: guest order links stay disabled until
`COMMERCE_ACCESS_TOKEN_SECRET` is set, and "Register webhook" returns `NOT_CONFIGURED` after creating the endpoint
(register again within 24 h to get the secret again, or copy it from the Stripe dashboard). `apps/storefront` loads `.env` with `node --env-file-if-exists`;
plain `astro dev` does not put it into `process.env`.

Without a Stripe key the plugin still loads: catalog reads, carts and the admin page work, everything that calls
Stripe answers `NOT_CONFIGURED` (503), and provider-bound cron steps are skipped.

### Options

All optional; the schema is `commerceOptionsSchema` in `src/contracts/options.ts` (strict: unknown keys are rejected).

| Option | Default | Meaning |
| --- | --- | --- |
| `storeName` | `"Store"` | Shown in emails and on the admin page (1-100 chars). |
| `defaultCurrency` | `"pln"` | Lower-case ISO code; must be in `supportedCurrencies`. |
| `supportedCurrencies` | `["pln"]` | Currencies a price may use (also the `currency` select of the `prices` collection). A cart still holds one currency. |
| `collections.products` / `variants` / `prices` / `attributes` / `attributeValues` / `productTypes` / `brands` / `categories` / `orders` / `payments` / `subscriptions` / `customers` / `carts` / `orderEvents` | `products`, `product_variants`, `prices`, `attributes`, `attribute_values`, `product_types`, `brands`, `product_categories`, `orders`, `payments`, `subscriptions`, `customers`, `carts`, `order_events` | Collection slugs, for sites that already use a name. |
| `checkout.uiModes` | `["hosted","embedded"]` | Enabled Checkout modes; a request for another answers `INVALID_INPUT`. |
| `checkout.successPath` | `/checkout/success?session_id={CHECKOUT_SESSION_ID}` | Hosted success redirect (site path or https URL). |
| `checkout.cancelPath` | `/cart` | Hosted cancel redirect. |
| `checkout.returnPath` | `/checkout/return?session_id={CHECKOUT_SESSION_ID}` | Embedded return URL. |
| `checkout.allowedRedirectOrigins` | `[]` | Extra origins allowed in those URLs besides the site's own. A URL outside them fails checkout with `NOT_CONFIGURED`. |
| `checkout.allowPromotionCodes` | `false` | Show the promotion code field. |
| `checkout.billingAddressCollection` | `"required"` | `auto` or `required`. |
| `checkout.shippingAddressCountries` | `[]` | ISO-2 countries; non-empty turns on shipping address collection. |
| `checkout.shippingRates` | `[]` | Up to 5 fixed rates `{ displayName, amount, currency, deliveryEstimateDays }`. Only rates in the cart's currency apply; payment mode only. |
| `checkout.collectPhone` | `false` | Collect a phone number. |
| `checkout.automaticTax` | `false` | Turn on only with an active Stripe Tax registration. |
| `checkout.locale` | `null` | Checkout UI locale (Stripe locale code). |
| `checkout.sessionMinutes` | `30` | Session lifetime and stock reservation lifetime; Stripe allows 30-1440. |
| `checkout.abandonedRetentionHours` | `48` | How long after a session ended the maintenance sweep keeps the snapshot, released stock hold and anonymous cart of an unpaid checkout. |
| `cart.ttlDays` | `30` | Cart lifetime, slid on every change (1-90). |
| `cart.maxLines` | `50` | Distinct lines per cart (1-100). |
| `cart.maxQuantityPerLine` | `99` | Quantity per line (1-999). |
| `cart.abandonAfterHours` | `24` | An idle `active` cart with lines and an email becomes `abandoned` (event). |
| `inventory.lowStockThreshold` | `5` | `inventory.low_stock` fires at or below this many available units. |
| `orders.numberPrefix` | `"ORD"` | Value of the `{PREFIX}` token (upper-cased, `A-Z0-9` only; `ORD` when empty). |
| `orders.numberFormat` | `{PREFIX}-{YYYY}-{seq:5}` | Order number template: `{PREFIX}`, `{YYYY}` (UTC year placed) and exactly one `{seq:N}` (N = 1-9, zero-padded counter that restarts every year; e.g. `ORD-2026-00042`). Literals: letters, digits and `- _ . / #`, at most 40 characters. The `generateOrderNumber` extension overrides it. |
| `orders.accessTokenDays` | `30` | Lifetime of signed order links (1-365). |
| `orders.portalReturnPath` | `/` | Where the Customer Portal sends the buyer back. |
| `emails.isEnabled` | `true` | Built-in transactional emails. The access-link email answers a buyer's own request and is always on. |
| `emails.orderViewPath` | `/orders/view?token={TOKEN}` | Site page that calls `orders/view` with the token. |
| `rateLimits.cartWritesPerMinute` | `60` | Per IP, on `cart/lines`. |
| `rateLimits.checkoutPerMinute` | `10` | Per IP, on `checkout`. |
| `rateLimits.orderLookupPerHour` | `10` | Per IP on `orders/access-link` and `customer/portal`; also per email on the access link. |
| `webhooks.maxAttempts` | `8` | Processing attempts before an event is parked as `dead` (1-20). |
| `webhooks.isReconcileEnabled` | `true` | Cron reconciliation from Stripe's event list. |

## Stripe setup checklist

1. **API key.** Create a restricted key per environment (test and live are separate). The adapter calls these
   resources, so give it write access to **Products** (create, update, search), **Prices**, **Checkout Sessions**
   (create, retrieve, expire), **Customers**, **Subscriptions** (retrieve, update, cancel), **Refunds** (create),
   **Customer portal sessions** and **Webhook Endpoints** (list, create, update), and read access to
   **PaymentIntents** (with latest charge), **Invoices** (with payments), **Events** and, optionally, **Account**
   (a key without it still works; the status page shows the account as unknown). Dashboard labels vary a little;
   the status page and the server log tell you which call a missing permission broke
   ("Stripe rejected the API key (invalid, revoked or missing permission)").
2. **Webhook.** Locally: `stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook`
   and put the printed `whsec_…` into the plugin settings or `STRIPE_WEBHOOK_SECRET`. Deployed: open
   **Commerce** in the admin and press **Register webhook**, or call the `commerce_webhooks_register` MCP tool. It
   creates the endpoint for this site's own URL with every event the plugin handles (pinned to the plugin's Stripe
   API version) and stores the signing secret. If the endpoint already exists only its event list is updated; Stripe
   never returns the secret twice, so copy it from the dashboard then. The status page reports `ok`,
   `not_registered`, `events_outdated`, `disabled`, `missing_secret` or `missing_key`.
3. **Customer Portal.** Save the portal configuration in the Stripe dashboard (Settings, Billing, Customer portal)
   for each mode. Without it `customer/portal` answers `PROVIDER_ERROR` (502) and the log says the portal is not configured.
4. **Stripe Tax** only with an active registration: then set `checkout.automaticTax: true` and the
   `taxBehavior` of your prices (and optionally a `tax_code` per product). With it off, Stripe collects no tax.
5. **Payment methods** come from the dashboard (dynamic payment methods); the plugin does not send
   `payment_method_types`.
6. **Product images** are sent to Stripe only when they are public absolute https URLs (not localhost, not relative).

## Content model

Collections the plugin creates (slugs configurable). A `content:beforeSave` guard rejects an editor's change to a
protected field with a readable message; plugin-owned collections cannot be created by hand. The plugin itself writes
through the content API without an actor, which the guard lets through.

### Catalog

| Collection | Where | Editors edit | Plugin-owned / read-only |
| --- | --- | --- | --- |
| `attributes` | Catalog | name, storefront label, code, input type (`select`, `multi_select`, `text`, `number`, `boolean`), presentation (`buttons`, `swatch`, `dropdown`), unit, filterable, its values (relation) | |
| `attribute_values` (hidden) | inside the attribute | label, code (used in derived SKUs), swatch colour (`#rgb` / `#rrggbb`) | |
| `product_types` | Catalog | name, code, variant axes (select attributes, at most 3), allowed values (an axis with none listed allows all of its values), specification attributes, required specifications (a subset of those) | |
| `brands` (routable `/shop/brand/{slug}`, SEO, search) | Catalog | name, logo, website, intro, description | |
| `product_categories` (routable `/shop/c/{slug}`, SEO, search) | Catalog | name, image, intro, description, parent category and subcategories (a self-related tree) | |
| `products` (routable `/shop/{slug}`, drafts, revisions, SEO, search) | Catalog | title, description (Portable Text), image, gallery, product type, brand, categories, base `price` (minor units), `sku` (a product without variants), `has_variants`, variants and prices (relations), `track_inventory`, `allow_backorder`, `tax_code` | `specs` (a JSON snapshot written by the Specification panel). **Product-level stock has no field**: change it through the `admin/inventory/adjust` route or the `commerce_inventory_adjust` MCP tool. |
| `product_variants` (hidden, no drafts) | inside the product | title (derived when empty), product, option values (one per axis), `price` override, image, gallery, `sku` (derived when empty), `is_active`, `track_inventory`, `allow_backorder`, **`stock`**, prices | `options_key` (sorted value ids, unique per product), `stripe_product_id`, `stripe_sync_status`, `stripe_sync_error`. Editing `stock` is turned into a stock delta; the field is rewritten after sales, refunds and admin adjustments. |
| `prices` (hidden, no drafts) | inside the product or variant | nickname, product **or** variant (exactly one), `type`, `unit_amount`, `currency`, `interval`, `interval_count`, `trial_days`, `tax_behavior`, `lookup_key`, `is_active`, `is_default` | `is_managed`, `stripe_price_id`, `stripe_sync_status`, `stripe_sync_error`. On a managed entry the money and activation fields are read-only too. |

How the model behaves:

- **Variants.** A variant is exactly one allowed value per axis of the product's type; `options_key` (the sorted value
  ids) is unique per product. Title and SKU are derived after the save when empty (`Shirt - M / Black`,
  `SHIRT-01-M-BLK`). A product has at most 50 variants. The **Variants** panel on the product generates the ticked
  combinations (skipping existing `options_key`s, capped at 50 in total).
- **Specification.** The **Specification** panel renders one control per specification attribute of the product's
  type and stores the values as a JSON snapshot in `specs` (a type change re-shapes it).
- **Publish guard.** Publishing or scheduling a product is refused, with a readable reason, when a required
  specification is empty, a product without variants has no SKU, a product with variants has no active variant, a
  variant's values do not fit the type's axes, two variants share an `options_key`, or the type itself is invalid
  (more than 3 axes, a non-select axis, a required specification outside its specification attributes).
- **Hybrid prices.** The product `price` and a variant's `price` override are mirrored into one managed `prices` entry
  per sellable (a simple product: one for the product; a product with variants: one per active variant, amount =
  override, else the product price; none on the product itself), in the first supported currency. Clearing the price or
  deactivating the variant archives the entry (`is_active` false); reactivating restores it. Extra prices (a
  subscription, another currency) are ordinary `prices` entries an editor adds; the default price a storefront
  offers is chosen by one rule: an active default entry that is not managed, else the managed entry, else the cheapest
  active one-time price, else the cheapest active price. A `prices` entry linked to neither or to both a product and a
  variant is marked failed and never sent to Stripe.
- **Relations.** Every cross-collection link is a native relation (parent-side and child-side fields). Relation fields
  have no column: neither `ctx.content` nor `fieldFilters` can read or filter them, so the plugin reads and writes them
  through one port and reads at most 50 children per field (the relation limits keep the bounded ones complete).
  Unbounded sets that are queried (payments of an order, events of an order) keep an indexed scalar id next to the relation.

Why a draft matters: a collection with revisions stages plugin writes into a draft revision, so the plugin does not
write `products` on its own (the Specification panel saves `specs` on an editor's explicit save, like any editor edit).
Anything the plugin must remember about a product lives in plugin storage (`catalog_links`).

An editor publishes a product; saving a variant or price (or publishing/unpublishing/trashing a product) queues a
sync that runs inline and is retried by cron on failure. The sync status of a variant or price is visible on its
entry; the Commerce page lists failures with a "Resync" button, and the product editor has a "Sync to Stripe" action.

### Sales

| Collection | Where | Editors edit | Plugin-owned / read-only |
| --- | --- | --- | --- |
| `orders` | Sales | `notes` | everything else: the three status axes, money, `lines`, addresses, review flags, Stripe ids, customer / subscription / payment / timeline links |
| `customers`, `subscriptions` | Sales | nothing | everything |
| `payments`, `order_events` (hidden) | inside the order (payments also inside the subscription) | nothing | everything |
| `carts` (hidden) | URL only | nothing | everything (a best-effort admin mirror; the authoritative cart is in plugin storage) |

An order has three independent status axes:

- `payment_status`: `pending`, `paid`, `failed`, `partially_refunded`, `refunded`, `disputed`, `dispute_lost`,
  `cancelled`. Driven only by provider events through one state machine.
- `order_status` (lifecycle): `open`, `completed`, `cancelled`, `archived`. Changed by an administrator through the order
  actions (`complete` needs payment paid or partially refunded and fulfillment `fulfilled`; `cancel` only while no money
  is held; `archive` from completed or cancelled; `reopen`). A provider event never changes it.
- `fulfillment_status`: `unfulfilled`, `partially_fulfilled`, `fulfilled`, `partially_returned`, `returned`. Set by an
  administrator; an archived order is frozen and a cancelled one cannot be shipped.

`lines` is a repeater snapshot of what was bought (title, variant title, SKU, option labels, quantity, unit, subtotal,
discount, tax and total amounts, product / variant / price ids as text). Every state change appends an entry to the hidden
`order_events` collection, shown by the **Timeline** panel of the order (which also carries the lifecycle buttons, a
fulfillment control and a note form for administrators). Order numbers are sequential per year from a counter in
plugin KV (`orders.numberFormat`); a crash between allocation and order creation leaves a gap, never a duplicate.

Plugin storage (machine state, not editable): `catalog_links`, `commerce_carts`, `checkout_snapshots`,
`inventory_levels`, `inventory_reservations`, `record_index`, `refunds`, `webhook_inbox`, `event_outbox`,
`rate_limits`.

## API overview

Public routes mount at `/_emdash/api/plugins/stripe-commerce/<route>`: `catalog/products`, `catalog/product`,
`catalog/availability`, `catalog/product-legacy` (deprecated), `cart`, `cart/lines`, `checkout`, `checkout/status`,
`orders/access-link`, `orders/view`, `customer/portal`, `webhook`. Private (admin session or MCP, permission-checked)
routes live under `admin/…` and `editor/…` (the editor panels and action). Success is `{ data }`; failures carry a real
HTTP status and a stable `code`. The cart id travels in the `x-commerce-cart` header (cookie `emdash_commerce_cart` as
fallback). Schemas and types for storefronts: `@emdash-commerce/plugin-stripe/contracts`. Everything, with inputs,
outputs, errors and events: **`docs/api.md`**.

## Operations

- **Commerce admin page** (admin menu, `plugins:manage`): key mode and last four characters, account, webhook
  health with a Register button, counters (failed and dead webhook events, dead outbox events, failed catalog syncs,
  held reservations, low stock), recent orders, failed events with Replay, failed catalog links with Resync,
  Reconcile now, Resync catalog.
- **MCP tools** (same permission checks as the routes; `destructive` marks calls an MCP client should confirm):

| Tool | Permission | Destructive |
| --- | --- | --- |
| `commerce_status` | `content:edit_any` | no |
| `commerce_orders_list`, `commerce_orders_get`, `commerce_orders_events` | `content:edit_any` | no |
| `commerce_inventory_get`, `commerce_webhooks_list` | `content:edit_any` | no |
| `commerce_orders_refund` (money) | `plugins:manage` | yes |
| `commerce_subscriptions_cancel` (money) | `plugins:manage` | yes |
| `commerce_inventory_adjust` (not idempotent) | `plugins:manage` | yes |
| `commerce_webhooks_replay` | `plugins:manage` | yes |
| `commerce_reconcile` | `plugins:manage` | yes |
| `commerce_orders_fulfillment`, `commerce_orders_action`, `commerce_orders_note`, `commerce_catalog_resync`, `commerce_webhooks_register`, `commerce_outbox_retry` | `plugins:manage` | no |

- **Cron.** One task, `commerce-maintenance`, every 5 minutes, running isolated steps within a 30 s budget (hook
  timeout 45 s): webhook inbox retries, outbox deliveries, catalog sync retries, reservation expiry, cart sweep
  (abandon, expire, delete after 7 days), reconciliation (at most every 15 minutes, only with a Stripe key) and
  retention purge (finished inbox and outbox records after 30 days). It is (re)scheduled on install, activate and on
  a visit to the status route.
- **Failure handling.** A failing webhook event is retried (30 s, 2 min, 8 min, 32 min, 2 h, then every 6 h) up to
  `webhooks.maxAttempts`, then parked as `dead`; replay it from the admin page or `commerce_webhooks_replay`.

## Testing

`@emdash-commerce/plugin-stripe/testing` exports everything a service or a site test needs: `createInMemoryWorld()`
(every persistence port in memory, sharing a fixed clock and a seeded id generator, following the same
compare-and-set and claim rules as the production stores), `createFakePaymentProvider()` (stateful, keeps Stripe's
idempotency-key semantics, `failNext`, `completeSession`, `recordEvent`), `webhookEvent()`, and `createFakePluginContext` /
`createFakeRouteContext` for route-level tests. Real Stripe payloads (captured or triggered in a sandbox, plus a few
derived by hand; provenance in `src/testing/fixtures/stripe/provenance.json`) are under `src/testing/fixtures/stripe/`
and used by this package's tests; they are not re-exported from `./testing`.

`createInMemoryWorld()` includes an in-memory `RelationsPort` (`createInMemoryRelations`) that follows the same rules as
the EmDash one (whole-set writes, ordered children, live reads hiding unpublished entries, one page of 50), pinned by a
shared contract suite. The `adapters/emdash/real-host/*.real.test.ts` tests run the reconciler, relations, stores and
repositories against a real in-memory SQLite EmDash database (`applySeed`, the exported content handlers), which proves
the fakes right.

```sh
pnpm --filter @emdash-commerce/plugin-stripe test
pnpm --filter @emdash-commerce/plugin-stripe typecheck
```

## Limitations

What this plugin does **not** do (each is by design or simply not built):

- **One currency per cart.** A catalog can price in several `supportedCurrencies`, but a cart that mixes them gets a
  `MIXED_CURRENCY` issue; there is no currency conversion or automatic price selection by region.
- **One billing interval per subscription cart.** Recurring lines with different intervals get `MIXED_INTERVAL`.
  Any recurring line makes the checkout a subscription-mode session.
- **Checkout Sessions only.** No PaymentIntents / Payment Element flow, no manual capture or partial captures, no
  saved-card management beyond the Stripe Customer Portal.
- **No tax calculation of its own.** Tax is Stripe Tax (`checkout.automaticTax`) or nothing.
- **Shipping is fixed rates in payment mode only** (max 5, in the cart's currency). Subscription carts get no
  shipping options; there are no calculated or carrier rates and no per-product shipping.
- **No customer accounts.** Customers are guests keyed by email; order access is by emailed signed link.
- **Refunds** cover the order's checkout payment (full or partial amount). There is no per-line refund input on the
  route (restock is a boolean for full refunds of untouched orders), and renewal payments of subscriptions are not
  refundable through the plugin.
- **Disputes are tracked, not fought:** order status and events follow the dispute; there is no evidence submission.
- **Subscriptions:** cancel now or at period end from the admin. No plan changes, pause or resume through the plugin
  (the buyer can use the Customer Portal).
- **One Stripe account**, no Connect, one pinned API version (`2026-10-28.endive`).
- **Cart email** is only captured at checkout (`email` in the checkout input), so `cart.abandoned` fires only for
  carts that reached checkout with an email.
- **The `carts` mirror collection only grows:** entries are created and updated, never deleted (storage carts are
  deleted 7 days after expiry or conversion).
- **Rate limits need an IP.** A request without `requestMeta.ip` is not rate limited.
- **Reconciliation reaches back at most as far as Stripe keeps events** (30 days).
- **Events from the other mode are ignored** (a test-mode event on a live key and vice versa).
- **Fulfilment** is a status field only: no shipment emails, labels or tracking, and no per-line fulfilment.
- **Catalog edits are mirrored, not imported.** Products created in the Stripe dashboard do not appear in EmDash.
- **Relation reads stop at 50.** One product has at most 50 variants and 50 prices, one attribute 50 values; relation
  fields cannot be filtered, so "orders of a customer" style reads go parent to children, and `options_key` uniqueness
  is a hook check, racy under concurrent saves of the same product.
- **One variant axis set per type, three axes at most**; no conditional or per-category fields.
- **No storefront.** The `./astro` export carries a Portable Text `product` block component for the demo site (it still
  reads the deprecated `catalog/product-legacy`); real storefront pages are the site's job.
