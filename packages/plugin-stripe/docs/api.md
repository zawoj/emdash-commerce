# HTTP API, MCP tools and domain events

Source of truth: `src/contracts/api.ts` (routes, zod schemas), `src/plugin/routes/*`, `src/plugin/http.ts`
(boundary), `src/plugin/mcp.ts`, `src/core/events.ts`, `src/core/errors.ts`. Storefronts import the schemas and
types from `@emdash-commerce/plugin-stripe/contracts` (it never loads EmDash or Stripe).

Base URL: `/_emdash/api/plugins/stripe-commerce/<route>`.

## Conventions

**Envelope.** A successful call answers 200 with `{ "data": <output> }` (EmDash's envelope). A failure carries a
real HTTP status and `{ "error": { "code", "message", "details" } }`; `details` is optional and safe to show. The
status is real because the plugin throws `PluginRouteError`: an EmDash route that *returns* an error object answers
HTTP 200.

**Error codes** (`core/errors.ts`):

| Code | Status | Meaning |
| --- | --- | --- |
| `INVALID_INPUT` | 400 | Input failed validation; `details.issues` is `[{ path, message }]` (values are never echoed). |
| `INVALID_SIGNATURE` | 400 | Webhook signature does not verify. |
| `UNAUTHORIZED` | 401 | Order/portal token invalid, expired or wrong scope (one generic message). Admin routes: EmDash answers 401 itself. |
| `FORBIDDEN` | 403 | Reserved; EmDash answers 403 itself for a missing permission. |
| `NOT_FOUND` | 404 | The record does not exist. |
| `CONFLICT` | 409 | State conflict (item unavailable, cart changing elsewhere, stock below zero, ...). |
| `CART_NOT_CHECKOUT_READY` | 409 | Empty cart or cart issues; `details.issues`. |
| `CART_LOCKED` | 409 | The cart's checkout session already completed; the cart cannot change. |
| `INSUFFICIENT_STOCK` | 409 | Reservation failed; `details.shortfalls` `[{ kind, id, requested, available }]` and `details.issues`. |
| `CATALOG_LIMIT_EXCEEDED` | 409 | A bounded relation (variants or prices of a sellable, values of an attribute, ...) holds more than the 50 links one read returns; the read refuses instead of truncating. |
| `REFUND_NOT_ALLOWED` | 409 | Order status, missing payment or amount over the refundable total (`details.refundable`). |
| `RATE_LIMITED` | 429 | Per-IP (or per-email) limit hit. |
| `PROVIDER_ERROR` | 502 | Stripe could not complete the call; `details.isRetryable`. The message is generic; the cause is in the server log. |
| `NOT_CONFIGURED` | 503 | No Stripe key / webhook secret / token secret, or a checkout redirect URL outside the allowed origins. |
| `INTERNAL` | 500 | Unexpected failure (also a failing `validateCart` / `customizeCheckout` extension, and a webhook event that could not be processed). The message is generic. |

**Input by method.** EmDash parses the input before the handler runs: `POST`, `PUT`, `PATCH` read the JSON body;
`GET`, `HEAD`, `DELETE` read the **URL query string** (a repeated key becomes an array). So `DELETE cart/lines` takes
`?priceId=…`, never a body. Admin routes are all `POST` with a JSON body.

**Public vs private.** Public routes have no authentication (`ctx.user` is undefined); EmDash still requires a
same-origin `Origin` header or `X-EmDash-Request: 1` on non-GET requests (requests without `Origin`, such as Stripe's
webhook, pass). Private routes are checked by EmDash against a permission: `content:edit_any` (EDITOR, "read") or
`plugins:manage` (ADMIN, "manage"); session callers also need the CSRF header. The admin UI and the MCP tools use
the same routes.

**Rate limits** (fixed window per key, only when the request has an IP): `cart/lines` 60/min,
`checkout` 10/min, `orders/access-link` and `customer/portal` 10/hour (all per IP; `access-link` also per
normalised email). Tunable under `rateLimits` (README).

**Money** is always integer minor units with a lower-case ISO currency (`{ amount, currency }` in the cart).

## Cart identity

The cart id is a **bearer secret**: 24 random bytes, base64url, 32 characters (`CART_ID_PATTERN =
/^[A-Za-z0-9_-]{32}$/`). The server chooses it; a client cannot pick one. Plugin routes cannot set cookies, so the
storefront stores the id itself (httpOnly cookie set by its own server route, or `localStorage`) and sends it on every
cart request:

- header **`x-commerce-cart: <cartId>`** (preferred), or
- cookie **`emdash_commerce_cart=<cartId>`** (fallback; read from the `Cookie` header).

A value that does not match the pattern is treated as "no cart", never as an error. `GET cart` never persists
anything: an unknown, expired or converted id yields a fresh unsaved cart (`isNew: true`, a new `cartId`). The cart is
created on its first `cart/lines` write; **store the `cartId` of every cart response** (it changes only when a new cart
was started). A converted cart is never modified or revived. Constants: `CART_HEADER`, `CART_COOKIE`,
`CART_ID_PATTERN` (exported from the package root and `./contracts`).

## Public routes

### `GET catalog/products`
Listing cards of published, sellable products. Query (all optional): `category` (category slug), `brand` (brand slug),
`limit` (1-200, default 60), `sort` (`newest` default, `price-asc`, `price-desc`, `name`). `Cache-Control: public,
max-age=30`. Output `catalogProductsView`: `{ items: ProductCardView[] }`. A product appears only when it is published
and has something to buy (a product without variants needs a usable price; one with variants needs an active variant
with an amount). The price sort uses the card's amount (the lowest variant price for a ranged product).

`ProductCardView` = `{ id, slug, title, excerpt, createdAt, images: [{ url, alt, width?, height? }], brand: { name, slug } | null,
categories: [{ name, slug }], price: { amount, currency, isRange, priceId }, availability: { state, lowCount }, sizes: [{ label,
isAvailable }], hasVariants }`.

- `excerpt` is the first paragraph of the description as plain text (about 160 characters), or `null`.
- `images` are the product image, its gallery, then each variant's image and gallery, de-duplicated by URL. Images picked
  from the media library are resolved to `/_emdash/api/media/file/<key>`; width and height are present when the media
  library recorded them.
- `price.priceId` is the price to add to a cart for a product without variants; for a product with variants it is `null`
  (the card gives the lowest `amount` and `isRange` when variant prices differ; the variant's own `priceId` is on the
  product page). `price.currency` is the first of `supportedCurrencies`.
- `availability.state` is `in_stock`, `low` (1 to 5 tracked units left; `lowCount` holds the count, exact counts above
  5 are never published), `backorder` or `sold_out`; for a product with variants it is merged over the active variants.
- `sizes` lists the values of the size axis (the axis whose code or name matches `size` / `rozmiar`) that an active
  variant uses, each with whether any such variant is still available; empty for a product without such an axis.

### `GET catalog/product?slug=<slug>`
`Cache-Control: public, max-age=30`. Output `productDetailView`: every `ProductCardView` field plus `description`
(Portable Text blocks or `null`), `sku` (or `null`), `axes`, `variants`, `specs`, `extraPrices` and `related`.

- `axes`: `[{ attributeId, code, label, presentation: buttons | swatch | dropdown, isImageAxis, values: [{ id, code,
  label, swatch }] }]`, in the order of the product type's axes, listing only values an active sellable variant uses
  (`isImageAxis` marks the colour axis, matched by code or name `colour` / `color` / `kolor`).
- `variants`: active variants that have a price: `[{ id, sku, title, options: { <axis code>: <value code> }, optionsKey,
  isActive, price: { amount, currency, priceId }, availability, imageUrls }]`. `price.priceId` is what to send to
  `cart/lines`. Empty for a product without variants (use the card's `price.priceId`).
- `price` on the page is the lowest variant amount (`isRange` when they differ, `priceId` `null`), `availability` is
  merged over the variants.
- `specs`: `[{ label, value }]` in the product type's order, with attribute and value labels resolved; empty values are
  left out.
- `extraPrices`: active prices an editor added (not the managed one): `[{ priceId, amount, currency, type: one_time |
  recurring, interval, intervalCount, trialDays, nickname }]` (subscriptions, other currencies).
- `related`: up to 4 cards of other published products, those sharing a category first, then the same product type
  (sold-out products are skipped).

Errors: `INVALID_INPUT`, `NOT_FOUND` (unknown, unpublished or unsellable slug). Never calls Stripe.

### `GET catalog/product-legacy?slug=<slug>` (deprecated)
The 0.2 product shape, kept until a storefront moves to `catalog/product` (the Portable Text `product` block still uses
it). Output `catalogLegacyProductView`: `{ id, slug, title, hasVariants, options: [{ name, values }], variants: [{ id,
title, sku, optionValues: [{ name, value }], available, isAvailable }], prices: [{ id, variantId, nickname, type,
unitAmount: { amount, currency }, interval, intervalCount, trialDays, lookupKey, isDefault, isPurchasable }], available,
isAvailable }`. `available` is `null` when stock is not tracked. `options` are derived from the product type's axes.
Errors: `INVALID_INPUT`, `NOT_FOUND` (unknown or unpublished slug).

### `GET catalog/availability?priceIds=a,b,c`
Up to 50 comma-separated price ids. `Cache-Control: no-store`. Output `{ prices: { [priceId]: { isPurchasable,
available } } }`. Errors: `INVALID_INPUT`.

### `GET cart`
Header/cookie: cart id (optional). Output `cartView`:
`{ cartId, isNew, status, lines, itemCount, subtotal, mode, issues, isCheckoutReady, expiresAt }` where
`status` is `active | checkout_open | converted | abandoned | expired`, `mode` is `payment | subscription | null`,
`subtotal` is `{ amount, currency } | null`, each line is `{ priceId, productId, variantId, title, variantTitle,
quantity, unitAmount, lineTotal, priceType, interval, intervalCount, trialDays, available }` and each issue
`{ code, priceId, message, available? }`. Issue codes: `PRICE_NOT_FOUND`, `PRICE_INACTIVE`, `PRODUCT_UNPUBLISHED`,
`VARIANT_INACTIVE`, `OUT_OF_STOCK`, `INSUFFICIENT_STOCK`, `MIXED_CURRENCY`, `MIXED_INTERVAL`, `NOT_SYNCED`,
`QUANTITY_LIMIT`, `CUSTOM` (from a site's `validateCart`). `isCheckoutReady` is true with at least one line and no issue.

### `POST cart/lines`
Body `{ priceId, quantity (0-999), mode?: "add" | "set" }` (default `add`; `set` with quantity 0 removes the line).
Returns the updated `cartView`. Rate limited. The price must exist and be buyable (price, product and variant active,
product published, currency supported). An open checkout is closed first (session expired, stock released) so it
cannot be paid with the old lines. Errors: `INVALID_INPUT`, `NOT_FOUND` (unknown price), `CONFLICT` (not available,
unsupported currency, cart being changed elsewhere), `CART_LOCKED`, `RATE_LIMITED`, `PROVIDER_ERROR`.

### `DELETE cart/lines?priceId=<id>`
Removes the line. Same output and errors as above.

### `POST checkout`
Body `{ uiMode?: "hosted" | "embedded" (default hosted), email?: string }`. Needs the cart id. Creates the cart's
Checkout Session, or returns the already open one for the same lines and mode (safe to double-click). Output
`checkoutView`: `{ sessionId, uiMode, url, clientSecret, expiresAt }`; hosted: redirect the buyer to `url`;
embedded: pass `clientSecret` to Stripe.js `initEmbeddedCheckout`. The session is also the stock reservation
(`expiresAt`). Errors: `INVALID_INPUT` (mode not in `checkout.uiModes`), `NOT_FOUND` (no live cart),
`CART_NOT_CHECKOUT_READY`, `INSUFFICIENT_STOCK`, `CONFLICT` (checkout is being prepared / cart changing; retry),
`NOT_CONFIGURED`, `PROVIDER_ERROR`, `RATE_LIMITED`, `INTERNAL` (extension failure).

### `GET checkout/status?session_id=<id>`
For the success/return page. Anyone holding the session id (it is in the URL) can read: `{ status:
"open"|"complete"|"expired", paymentStatus: "paid"|"unpaid"|"no_payment_required", orderNumber, orderStatus,
maskedEmail }` (`orderStatus` here is the order's **payment** status, `pending`, `paid`, ..., under the name it had before orders
got a separate lifecycle status) (`j***@example.com`). `orderNumber` stays `null` until settlement (the webhook) created the order, so
poll briefly. Answers only for sessions this plugin created. Not rate limited. Errors: `NOT_FOUND`, `PROVIDER_ERROR`.

### `POST orders/access-link`
Body `{ email, orderNumber }`. Always `{ isAccepted: true }` whether or not the order exists (no enumeration); when
the order number and email belong together a signed link is emailed (`emails.orderViewPath`, `{TOKEN}` replaced).
Rate limited per IP and per email. Errors: `INVALID_INPUT`, `RATE_LIMITED`.

### `GET orders/view?token=<token>`
`Cache-Control: no-store`. Token scope `order:view`. Output `orderView`: `{ orderNumber, status
(deprecated: the payment status), orderStatus (lifecycle), paymentStatus, fulfillmentStatus, placedAt, email,
customerName, lines: [{ title, variantTitle, quantity, unitAmount, amountTotal }], totals: { subtotal, discount, tax,
shipping, total, refunded, currency }, hasSubscription, canOpenPortal }`. Errors:
`UNAUTHORIZED` (any invalid token), `NOT_CONFIGURED` (no token secret).

### `POST customer/portal`
Body `{ token }` (scope `portal`; an order-view-only link cannot open it). Output `{ url }` of a Stripe Customer
Portal session returning to `orders.portalReturnPath`. Rate limited. Errors: `UNAUTHORIZED`, `CONFLICT` (order has no
Stripe customer), `PROVIDER_ERROR` (including "portal not configured": the generic message hides it; see the log),
`RATE_LIMITED`.

### `POST webhook`
Stripe delivers here. The body is read as raw text and the `stripe-signature` header is the only declared header.
Answers `{ data: { received: true, duplicate?: true, ignored?: true } }`. Status codes are the contract with Stripe
(which retries any non-2xx for days): `503 NOT_CONFIGURED` (no signing secret yet), `400 INVALID_SIGNATURE`,
`200` handled / duplicate / ignored, `500 INTERNAL` (the event is stored with backoff; cron retries too).

## Private routes (admin and MCP)

All `POST`, JSON body (`{}` or no body where there is no input). `read` = `content:edit_any`, `manage` = `plugins:manage`.

| Route | Permission | Input | Output |
| --- | --- | --- | --- |
| `admin` | manage | Block Kit interaction (`page_load`, `block_action`, `form_submit`) | Block Kit page (blocks + optional toast): the "Commerce" admin page |
| `admin/status` | read | none | key presence/mode/last 4, account, webhook health (`ok`, `missing_key`, `missing_secret`, `not_registered`, `events_outdated`, `disabled`, `unknown`), counters (failed/dead inbox, dead outbox, failed catalog links, held reservations, low stock; `isCapped` when truncated), low-stock list, 10 recent orders, cron info. Never returns a secret. Also re-schedules the cron task. |
| `admin/orders/list` | read | `{ status? (payment status), orderStatus? (lifecycle), cursor?, limit? (1-100, default 25) }` | `{ items: OrderSummary[], cursor }`; an unknown `status` or `orderStatus` is `INVALID_INPUT` |
| `admin/orders/get` | read | `{ orderId?` or `orderNumber? }` (one required) | `{ order, payments, refunds, subscription, events }` (personal data; `events` = the latest timeline entries, newest first) |
| `admin/orders/events` | read | `{ orderId, cursor?, limit? (1-100, default 50) }` | `{ items: OrderTimelineEvent[], cursor }`, newest first |
| `admin/inventory/get` | read | `{ kind: "product"\|"variant", id }` | `{ stock: { onHand, reserved, available, isTracked }, heldReservations }` |
| `admin/webhooks/list` | read | `{ status? (default failed; received, processing, processed, failed, dead, ignored), cursor?, limit? }` | `{ items, cursor }` (no payloads) |
| `admin/orders/refund` | manage | `{ orderId, amount? (minor units, omit = full), reason? (requested_by_customer, duplicate, fraudulent), note?, restock? (default false), requestId (8-64 chars) }` | the `Refund` record. The same `requestId` always means the same refund; reusing it with a different amount is `CONFLICT`. Errors: `NOT_FOUND`, `REFUND_NOT_ALLOWED`, `INVALID_INPUT` (restock only for a full refund of an untouched order), `PROVIDER_ERROR`. |
| `admin/orders/fulfillment` | manage | `{ orderId, fulfillmentStatus: unfulfilled\|partially_fulfilled\|fulfilled\|partially_returned\|returned }` | `OrderSummary`; setting the current value changes nothing, no email. `CONFLICT` for an archived order, or shipping a cancelled one. Records a timeline entry and emits `order.fulfillment_changed`. |
| `admin/orders/action` | manage | `{ orderId, action: complete\|cancel\|archive\|reopen }` | `OrderSummary`. `CONFLICT` (with the reason) when the lifecycle forbids it: `complete` needs payment `paid` or `partially_refunded` and fulfillment `fulfilled`, `cancel` is refused while the order holds money (paid, partially refunded, disputed), `archive` only from completed or cancelled, `reopen` not from open. No money moves. Records a timeline entry and emits `order.completed`, `order.cancelled`, `order.archived` or `order.reopened`. |
| `admin/orders/note` | manage | `{ orderId, note (1-500 chars) }` | `{ id }` of the timeline entry. **Not idempotent.** |
| `admin/subscriptions/cancel` | manage | `{ subscriptionId (plugin id), atPeriodEnd? (default true) }` | the `Subscription`; cancelling a cancelled one changes nothing |
| `admin/inventory/adjust` | manage | `{ kind, id, delta (non-zero int), reason (1-200) }` | `StockView`. Never below zero (`CONFLICT`). **Not idempotent.** The only way to change product-level stock. |
| `admin/catalog/resync` | manage | `{ productId? }` | `{ queued }`; the cron task syncs within minutes |
| `admin/catalog/sync` | manage | `{ limit? (1-100, default 25) }` | `{ processed, due, failed, isCapped }`. Syncs a batch of due links now; repeat until `due` is 0 to finish a resync without waiting for the five-minute maintenance task (which does 25 per run). |
| `admin/webhooks/register` | manage | none | `{ action: created\|updated, endpointId, url, enabledEventCount, isSecretStored, message }` |
| `admin/webhooks/replay` | manage | `{ eventId }` | `{ outcome, error?, reason? }`; `NOT_FOUND`, `CONFLICT` (being processed right now) |
| `admin/reconcile` | manage | `{ since? (epoch seconds) }` | `{ since, scanned, recorded, processed, ignored, failed, isTruncated }` (run again when truncated) |
| `admin/checkouts/sweep` | manage | `{ retentionHours? (0-720, default `checkout.abandonedRetentionHours`) }` | `{ snapshots, sessionsExpired, holdsReleased, carts, holdRecords, settledSnapshots }`. Removes the leftovers of unpaid checkouts whose session ended (see architecture: Abandoned checkouts). `0` removes everything that already ended; a payment that settles after that is flagged `missing_snapshot`. Paid orders are never touched. The cron task runs it on its own. |
| `admin/outbox/retry` | manage | `{ eventId }` | `{ eventId }`; undelivered subscribers only |

`OrderSummary` = `{ id, orderNumber, orderStatus, paymentStatus, fulfillmentStatus, email, total, refunded, currency,
placedAt, hasReviewFlags }`. The `status` field is gone (it was the payment status; read `paymentStatus`).

An order has three status axes. Payment status (`paymentStatus`): `pending`, `paid`, `failed`, `partially_refunded`,
`refunded`, `disputed`, `dispute_lost`, `cancelled`. Lifecycle (`orderStatus`): `open`, `completed`, `cancelled`,
`archived`. Fulfillment: `unfulfilled`, `partially_fulfilled`, `fulfilled`, `partially_returned`, `returned`.
`OrderTimelineEvent` = `{ id, orderId, type, message, actorKind, actorLabel, data, occurredAt, sourceKey }` with `type`
one of `placed`, `payment_status_changed`, `order_status_changed`, `fulfillment_status_changed`, `refund_created`,
`dispute_opened`, `dispute_closed`, `email_sent`, `note` and `actorKind` one of `system`, `admin`, `provider`,
`customer`. Review flags: `amount_mismatch`, `line_items_mismatch`, `currency_mismatch`,
`missing_snapshot`, `inventory_shortfall`, `livemode_mismatch`.

### Editor routes (EmDash admin only)

The product and order editors call these through EmDash's editor extension points (declared in
`plugin/admin.ts`, scoped to the configured collection slugs). They are private `POST` routes, not part of the storefront
API and not exposed as MCP tools; the entry the panel was opened on is attested by the host (`ctx.ui.entry`).

| Route | Permission | Input | Output |
| --- | --- | --- | --- |
| `editor/variants` | read | Block Kit panel interaction (`panel_load`, `block_action`, `form_submit`) | Block Kit panel (the Variants generator: one checkbox group per axis of the product's type) with an optional toast; a successful `form_submit` creates the ticked combinations that do not exist yet and asks the editor to refresh |
| `editor/specification` | read | same | Block Kit panel (one control per specification attribute of the type); a `form_submit` saves the `specs` snapshot |
| `editor/catalog-resync` | manage | none | `{ toast }`; the "Sync to Stripe" action (queues the product, its variants and prices) |
| `editor/order-timeline` | read | same panel interaction | Block Kit panel: the three status axes, lifecycle buttons, a fulfillment control, a note form and the paged event log. Reading is `read`; every mutation inside it additionally requires the administrator role (the panel route has a single permission, so the stricter check runs inside the handler) |

The two product panels and the product action refuse an entry of another collection with `INVALID_INPUT`; the timeline panel shows an error banner for an entry that is not an order.

## MCP tools

One tool per private route (`src/plugin/mcp.ts`); the permission is the route's. Descriptions are written for the
agent. `destructive` makes an MCP client ask first.

| Tool | Route | Destructive |
| --- | --- | --- |
| `commerce_status` | `admin/status` | no |
| `commerce_orders_list` | `admin/orders/list` | no |
| `commerce_orders_get` | `admin/orders/get` | no |
| `commerce_orders_refund` | `admin/orders/refund` | **yes** (money) |
| `commerce_orders_events` | `admin/orders/events` | no |
| `commerce_orders_fulfillment` | `admin/orders/fulfillment` | no |
| `commerce_orders_action` | `admin/orders/action` | no |
| `commerce_orders_note` | `admin/orders/note` | no (not idempotent) |
| `commerce_subscriptions_cancel` | `admin/subscriptions/cancel` | **yes** (money) |
| `commerce_inventory_get` | `admin/inventory/get` | no |
| `commerce_inventory_adjust` | `admin/inventory/adjust` | **yes** (not idempotent) |
| `commerce_catalog_resync` | `admin/catalog/resync` | no |
| `commerce_catalog_sync` | `admin/catalog/sync` | no |
| `commerce_checkouts_sweep` | `admin/checkouts/sweep` | no |
| `commerce_webhooks_register` | `admin/webhooks/register` | no |
| `commerce_webhooks_list` | `admin/webhooks/list` | no |
| `commerce_webhooks_replay` | `admin/webhooks/replay` | **yes** |
| `commerce_reconcile` | `admin/reconcile` | **yes** |
| `commerce_outbox_retry` | `admin/outbox/retry` | no |

## Domain events

Delivered at-least-once to subscribers (`docs/extending.md`); `id` is deterministic where possible
(`${type}:${sourceId}`), so a replayed webhook emits the same id. Payloads carry ids and small facts only; a
subscriber loads the record through its `ExtensionContext`. Adding a field is backward compatible; removing or
renaming one is a breaking change of the package.

```ts
interface CommerceEvent<T> { id: string; type: T; occurredAt: string /* ISO */; data: Payload[T] }
```

| Type | Payload (`data`) | Emitted when |
| --- | --- | --- |
| `order.created` | `{ orderId, orderNumber, status (deprecated: the payment status), paymentStatus, orderStatus }` | settlement created the order |
| `order.paid` | `{ orderId, orderNumber, amount, currency }` | the order is paid |
| `order.payment_failed` | `{ orderId, orderNumber, failureCode \| null }` | async payment failed |
| `order.refunded` | `{ orderId, orderNumber, refundId, amount, amountRefundedTotal, isFullyRefunded }` | a refund succeeded (once per refund) |
| `order.disputed` | `{ orderId, orderNumber, amount, reason \| null }` | a dispute opened |
| `order.dispute_closed` | `{ orderId, orderNumber, outcome: "won" \| "lost" }` | a dispute closed |
| `order.cancelled` | `{ orderId, orderNumber }` | an administrator cancelled the order (`admin/orders/action`) |
| `order.completed` | `{ orderId, orderNumber }` | an administrator completed the order |
| `order.archived` | `{ orderId, orderNumber }` | an administrator archived the order |
| `order.reopened` | `{ orderId, orderNumber, previousStatus }` | an administrator reopened the order (`previousStatus` is the lifecycle status it left) |
| `order.fulfillment_changed` | `{ orderId, orderNumber, fulfillmentStatus, previousStatus }` | the fulfillment status changed (not emitted when the value is set to itself) |
| `order.needs_review` | `{ orderId, orderNumber, flags: ReviewFlag[] }` | review flags set (once per distinct flag set) |
| `subscription.created` | `{ subscriptionId, customerId \| null, status }` | a subscription record was created |
| `subscription.updated` | `{ subscriptionId, status, previousStatus \| null, cancelAtPeriodEnd }` | status, period end, amount, items or cancel flag changed |
| `subscription.canceled` | `{ subscriptionId, customerId \| null }` | status became `canceled` |
| `subscription.trial_will_end` | `{ subscriptionId, trialEnd: ISO }` | Stripe's trial-ending notice |
| `invoice.paid` | `{ subscriptionId, paymentId, amount, currency }` | a renewal invoice was paid (not the first invoice) |
| `invoice.payment_failed` | `{ subscriptionId, amount, currency, attemptCount }` | an invoice payment attempt failed |
| `customer.created` | `{ customerId, email }` | emitted by settlement for the order's customer on every settlement pass; the id is `customer.created:<customerId>`, so subscribers see it once per customer while the outbox record exists (finished records are purged after 30 days) |
| `customer.updated` | `{ customerId }` | a Stripe customer event refreshed the profile |
| `cart.converted` | `{ cartId, orderId }` | the cart became `converted` |
| `cart.abandoned` | `{ cartId, email \| null, itemCount }` | an idle `active` cart with lines and an email passed `cart.abandonAfterHours` |
| `inventory.low_stock` | `{ sellable: { kind, id }, available, threshold }` | after a sale or adjustment, `0 < available <= lowStockThreshold` |
| `inventory.out_of_stock` | `{ sellable }` | after a sale or adjustment, `available <= 0` (tracked sellables only) |
| `catalog.sync_failed` | `{ entity: product\|variant\|price, id, error }` | a sync attempt failed (id includes the attempt number) |
| `catalog.drift_detected` | `{ entity: product\|price, id, stripeId, fields: string[] }` | Stripe differs from what the plugin last wrote (`name`, `active`, `unit_amount`, `currency`) |

Built-in subscriber `builtin-emails` handles `order.paid`, `order.payment_failed` and `order.refunded`
(confirmation with a signed order link, failed payment, refund).
