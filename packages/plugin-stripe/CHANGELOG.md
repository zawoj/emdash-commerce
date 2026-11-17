# @emdash-commerce/plugin-stripe

## Unreleased — catalog v2: relations, product types, three-axis orders

Decision: `.ai/decisions/2026-11-13-emdash-commerce-catalog-relations-and-orders.md`. The plugin is unreleased, so the
0.2 local data is wiped and the demo catalog re-seeded instead of migrated (`0001`, `0002` stay as no-op data migrations).

### Added

- **Native EmDash relations** for every link between plugin collections (declared as `RelationDefinition`s, created
  through `applySeed`, read and written only through `RelationsPort`; a page of 50 children, no cursor; the in-memory
  port in `./testing` follows the same rules, pinned by a contract suite). Relations that are read in full are bounded
  to 50 (`CATALOG_LIMIT_EXCEEDED` instead of truncating).
- **Schema reconciler v2** over `applySeed`: adds only missing relations, collections and fields and keeps what an editor
  customised; `hidden` collections (variants, prices, attribute values, payments, order events, carts); sidebar folders
  **Catalog** (Products, Product types, Attributes, Brands, Categories) and **Sales** (Orders, Customers, Subscriptions,
  Commerce page).
- **Catalog model**: `attributes` + `attribute_values`, `product_types` (up to 3 variant axes, allowed values, specification
  attributes, required specifications), `brands`, `product_categories` (a self-related tree), products with type, brand,
  categories, base `price`, `sku`, `specs` and gallery; variants with exactly one value per axis (`options_key` unique per
  product, derived title and SKU, `price` override, gallery).
- **Publish guard** (`content:beforePublish` / `beforeSchedule`, capability `hooks.content-policy:register`): a product
  cannot go live with a missing required specification, a missing SKU (no variants), no active variant, variant values
  that do not fit the type, duplicate `options_key`s or an invalid type; plus field checks on save (swatch colour,
  non-negative whole-number prices).
- **Editor tools** (Block Kit): Variants generator and Specification panels and a "Sync to Stripe" action on products;
  Timeline panel on orders (status axes, lifecycle buttons, fulfillment, notes, paged event log).
- **Hybrid prices**: the product price and a variant's override are mirrored into one managed `prices` entry per sellable
  (`is_managed`, locked against editing); extra prices stay ordinary entries; `selectDefaultPrice` is the one default-price
  rule; a price linked to neither or both of product and variant is marked failed and never synced.
- **Storefront API**: `catalog/products` (cards: images, brand, categories, price or range, availability state, size
  chips; filter `category` / `brand`, `limit`, `sort`) and the new `catalog/product` (axes, variants with prices and
  availability, specs, extra prices, related). Both are served from the relations; they never call Stripe.
- **Orders**: three axes (`order_status` lifecycle `open` / `completed` / `cancelled` / `archived`, `payment_status`,
  `fulfillment_status` with five values), `lines` repeater snapshot, hidden `order_events` timeline (idempotent per source
  key), admin actions `complete` / `cancel` / `archive` / `reopen` with guards, internal notes, sequential per-year numbers
  from a KV counter (`orders.numberFormat`, default `{PREFIX}-{YYYY}-{seq:5}`; `generateOrderNumber` still overrides).
- Routes `admin/orders/action`, `admin/orders/events`, `admin/orders/note`, the editor routes (`editor/variants`,
  `editor/specification`, `editor/catalog-resync`, `editor/order-timeline`) and MCP tools `commerce_orders_action`,
  `commerce_orders_events`, `commerce_orders_note` (17 tools in all); `admin/orders/list` filters by `orderStatus`;
  `admin/orders/get` returns the latest `events`.
- Domain events `order.completed`, `order.archived`, `order.reopened`, `order.fulfillment_changed`; `order.cancelled` is now
  emitted by the cancel action.
- Options `collections.{attributes, attributeValues, productTypes, brands, categories, orderEvents}` and `orders.numberFormat`.
- Media resolver (`adapters/emdash/content/media.ts`): a media-library image (provider `local`, no `src`) resolves to
  `/_emdash/api/media/file/<storageKey or id>`, with width and height when known; `gallery` repeater (`image` + `alt`) on
  products and variants; `images` and variant `imageUrls` include it.
- `content:beforeDelete` hook, `CatalogMirror.writePriceActive`, real-host tests against an in-memory SQLite EmDash.

### Changed

- Cross-collection links are native relations, not scalar `reference` ids: the variant's `product`, the price's `product` /
  `variant`, the order's `customer`, subscription / payment / timeline links. Payments and order events keep an indexed
  scalar `order_id` (and `subscription_id`) next to the relation for queries.
- `orders.numberPrefix` is now only the `{PREFIX}` token of the format; `ORD-2026-XXXXXX` (random) became `ORD-2026-00042`.
- `GET catalog/product` has a new shape (below); the 0.2 shape is `catalog/product-legacy`.
- `checkout/status.orderStatus` and `orders/view.status` still carry the payment status (the latter deprecated) next to the
  new `orderStatus` / `paymentStatus` fields.

### Breaking (for sites, storefronts and extension authors)

- **Data model.** `product_variants.option_values` is now a relation and the free-text `options` repeaters on products and
  variants are gone (use a product type and attributes); the JSON line items of an order are replaced by the `lines`
  repeater; the order's single status is split: the 0.2 `order_status` field held the **payment** status and now holds the
  **lifecycle** status (`open`, ...), the payment status is the new `payment_status` field, plus `fulfillment_status`
  with five values; prices, payments and the other links are relations. There is no data migration: wipe local commerce data and re-seed.
- **Types and exports.** `ORDER_STATUS` / `OrderStatus` are **deprecated aliases** of `ORDER_PAYMENT_STATUS` /
  `OrderPaymentStatus` (the payment axis was renamed; use the new names, the aliases go after the next release). `Order.status`
  is **removed**: read `paymentStatus`, `orderStatus` and `fulfillmentStatus`. `OrderSummary.status` is replaced by
  `orderStatus` + `paymentStatus`. `order.created` keeps a deprecated `status` (= `paymentStatus`).
- **Routes.** `catalog/product` returns `productDetailView` (axes, variants with `options` by code, `price`, `availability`,
  specs, related) instead of the 0.2 view; storefronts that still want the old shape call `catalog/product-legacy`
  (deprecated; the Portable Text `product` block does). `admin/orders/fulfillment` accepts five values
  (was `unfulfilled | fulfilled | returned`). `admin/orders/list` takes `orderStatus`.
- **Collections.** New slugs in `CommerceOptions.collections`; sites that renamed collections must name the new ones.
  Collections and fields a site added by hand to plugin-owned collections are left alone by the reconciler.
- **Seeds.** A site seed must create links through the seed's `relations` support (`applySeed`), because relation-bound
  fields cannot be written with `ctx.content`.

### Fixed

- Images picked from the media library (no `src`) now reach the storefront API through one resolver for every product,
  variant and gallery image.
- Trashing a variant or product archives its Stripe objects and settles the links (they stayed `pending`, due since 1970);
  an inactive variant archives its managed price and reactivating restores it; cron settles any link whose entity is gone.
- A required repeater sub-field no longer breaks draft autosave: every sub-field of the line and gallery repeaters is
  optional (the old option repeaters, which had the bug, are removed).

## 0.3.0

### Minor Changes

- [#2](https://github.com/zawoj/emdash-commerce/pull/2) [`e0ab676`](https://github.com/zawoj/emdash-commerce/commit/e0ab676ddd5b82c24f0c9f7a70ead4363421ff4b) Thanks [@zawoj](https://github.com/zawoj)! - First public release of the commerce packages for EmDash, a community project that is not part of EmDash itself.

  - `@emdash-commerce/plugin-stripe` adds the `stripe-commerce` plugin: a catalog with product types, variants and prices, carts, Stripe Checkout, orders and signature-verified webhooks, plus an admin editor for products and orders.
  - `@emdash-commerce/plugin-image-hotspots` adds the `image-hotspots:hotspots` field widget for placing numbered points on an image, and `normaliseValue` to read the stored value on your site.
  - `@emdash-commerce/design-system` adds the design tokens and the props-driven Astro components used by the demo storefront.

  All three packages ship TypeScript and Astro source, like EmDash's own plugins, so Astro and Vite compile them in your site. See each package's README for installation and registration in `astro.config.mjs`.

### Patch Changes

- [#9](https://github.com/zawoj/emdash-commerce/pull/9) [`2612930`](https://github.com/zawoj/emdash-commerce/commit/2612930b43bbba0b349cc9c47518f6716951249a) Thanks [@zawoj](https://github.com/zawoj)! - Saving many variants at once no longer loses managed prices, and saving without a Stripe key no longer touches the rows. The managed price of each variant is now converged under its own lock instead of one lock per product: twenty variant saves used to queue behind each other past EmDash's 5 s hook timeout, and a variant whose hook timed out was left without a price (its option showed as unavailable) and could leave its lock held for five minutes. Without a Stripe key, a price or variant save also no longer gets `stripe_sync_status = failed` written into its row right after the save, a write that on Cloudflare D1 could collide with the next save or publish of the same row (`409 CONFLICT`, "Content changed while the operation was in progress"); the sync link still records the failure and backs off, and a real Stripe error still marks the row `failed`.

- [#9](https://github.com/zawoj/emdash-commerce/pull/9) [`6b5f970`](https://github.com/zawoj/emdash-commerce/commit/6b5f970da2e4cb543a0382806729dae1b3054456) Thanks [@zawoj](https://github.com/zawoj)! - A fresh shop can now receive `emdash site import`. EmDash's importer treats every relation definition as content, and the plugin creates 19 of them on its first start, so the import was refused with `TRANSFER_TARGET_NOT_EMPTY`. Start the target shop with `COMMERCE_DEFER_RELATIONS=1` (a plain environment variable, not a secret): while the site has no relation, the plugin creates its collections without relations and without the fields bound to them, and skips its data migrations. Import the package, then remove the variable and restart: the plugin completes the schema as it does for any upgrade, without duplicating a relation. A site that already has relations is not affected by the variable. Do not create products by hand while it is set, because the product form has no variant, price or category pickers until the relations exist.

## 0.2.0 — 2026-11-12

A rewrite into a layered, provider-neutral commerce backend (`core` -> `ports` -> `services` -> `adapters` -> `plugin`;
decision: `.ai/decisions/2026-11-12-emdash-stripe-commerce-architecture.md`). Docs: `README.md`, `docs/architecture.md`,
`docs/api.md`, `docs/extending.md`.

### Fixed

- Product option rows and variant option value rows no longer require their sub-fields: EmDash validates draft
  autosaves, so an editor adding an empty row got "Autosave failed". Data migration `0002-optional-option-sub-fields`
  updates existing databases (`SchemaPort.setFieldValidation`).

### Added

- Catalog model = Stripe model: products, variants (each a Stripe Product) and many one-time or recurring prices per
  product or variant, in several currencies. One-way sync with price immutability (new Stripe Price on a terms change,
  reuse on revert), adoption by metadata, version-carrying idempotency keys and drift detection.
- Inventory in plugin storage with guarded atomic updates, reserved for the lifetime of a Checkout Session, committed
  on payment, released on expiry or failure; editors' variant `stock` edits become deltas.
- Server-side carts addressed by a bearer id (`x-commerce-cart` header, `emdash_commerce_cart` cookie fallback),
  server-side pricing, cart issues, `add`/`set`/remove lines, abandonment and expiry sweeps.
- Hosted and embedded Checkout Sessions (payment and subscription mode), promotion codes, fixed shipping rates,
  phone/address collection, optional Stripe Tax, trials, double-submit protection, a server-side checkout snapshot.
- Settlement from provider events only, exactly once, with review flags for mismatches; order state machine;
  payments, refunds (safe to repeat, partial or full, optional restock), disputes, subscriptions and invoices,
  guest customers, signed order-access and Customer Portal links.
- Durable webhook inbox (record once, lease, retry with backoff, `dead`, replay) and cron reconciliation from Stripe's
  event list; 34 handled Stripe event types.
- Domain-event outbox with per-subscriber delivery state; extension API (`defineSubscriber`, `validateCart`,
  `customizeCheckout`, `generateOrderNumber`, `emails`, `stripeWebhooks`) through a site-owned entrypoint
  (`createStripeCommercePlugin(options, extensions)`); built-in transactional emails.
- Admin: "Commerce" Block Kit page, 14 private routes, 14 MCP tools, one maintenance cron task.
- Admin sidebar: the collections live in a "Catalog" and a "Sales" folder (EmDash `group` + `sortOrder`, from 1000 so a
  site's own numbered collections stay above), the Commerce page at the end of "Sales". The reconciler places existing
  collections that have no folder and no position, and never moves one an admin has placed.
- Plugin-owned `payments`, `subscriptions`, `customers`, `product_variants`, `prices` collections; additive schema
  reconciler and run-once data migrations; read-only guard on provider-driven fields.
- `./contracts` (HTTP API schemas, options, extension API) and `./testing` (in-memory ports, fake provider, fakes of the
  EmDash context) exports; Stripe event fixtures captured from a sandbox.

### Breaking (vs 0.1 / the prototype)

- **Data model.** `products` no longer carries a price (prices are their own collection); `orders` has new fields
  (`payment_status` became `order_status`, money, line items, Stripe ids) and statuses; plugin storage collections `stripe_products`, `stripe_events`, `order_index`,
  `cart_index`, `carts` were replaced (`catalog_links`, `commerce_carts`, `webhook_inbox`, `record_index`, ...).
  There is no data migration: wipe local commerce data and reseed.
- **Routes.** `cart/items` -> `cart/lines` (input is a **price id**, not a product id); `register-webhook` ->
  `admin/webhooks/register`; new `catalog/*`, `checkout/status`, `orders/*`, `customer/portal` and `admin/*`; the webhook
  route answers 503/400/500 per Stripe's contract. Errors are `{ error: { code, message } }` with real statuses.
- **Cart cookie** `emdash_stripe_cart_id` -> `emdash_commerce_cart`, plus the `x-commerce-cart` header; the id is
  24 random bytes (32 base64url characters).
- **Exports.** The default export, `CART_COOKIE_NAME` and `isValidCartId` are gone: use `createPlugin` /
  `createStripeCommercePlugin`, `CART_COOKIE`, `CART_HEADER`, `CART_ID_PATTERN`. New entries `./contracts`, `./testing`.
  The `./astro` product block still exists but must be pointed at the new API by the storefront.
- **Webhook.** The endpoint must be registered again (new event list, pinned API version); the old
  `stripe_events` dedupe is gone.
- **Requirements.** `emdash` ^1.5.0, Stripe SDK 23.1.0 with API version `2026-10-28.endive`; Customer Portal must be
  configured in Stripe for `customer/portal`.

## Prototype, before the rewrite (shipped as "0.2.0" in the old changelog)

- Admin **`carts`** collection (mirror from plugin storage; `cart_status`, context fields, no IP).
- Cart items **`mode: "add" | "set"`**; line **`reason`** codes; checkout marks `checkout_started`; webhook marks `converted`.
- Stripe product **adoption** (metadata search/list) on activate and lazy cart pricing.
- Portable Text **`product`** block + `./astro` export (`componentsEntry` in site config).

## 0.1.0

### Fixes after review

- Stripe Product/Price mapping moved to plugin storage `stripe_products` (live cart pricing no longer depends on content fields removed from seed).
- Product sync on `content:afterSave` / publish / unpublish / delete; drafts create inactive Stripe products immediately.
- Parameter-derived Stripe idempotency keys and stable checkout `integration_identifier` in `ctx.kv`.
- Webhook processing claim (`compareAndSet`), mark processed after success, release claim + HTTP 500 on failure.
- Order `line_items` from `checkout.sessions.listLineItems`.
- Carts persist on first item; opportunistic expired-cart purge; `GET cart` without cookie does not write storage.
- Checkout rejects unpurchasable lines and mixed currencies; demo `POST /api/cart-cookie` requires same-origin and valid cart id format.
