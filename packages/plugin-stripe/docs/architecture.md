# Architecture

How `@emdash-commerce/plugin-stripe` is built and why. The decision record is
`.ai/decisions/2026-11-12-emdash-stripe-commerce-architecture.md` (repo root); this file describes the code as it is.
Paths are relative to `packages/plugin-stripe/src`.

## Layers and the dependency rule

```
                      plugin/                 EmDash wiring: definePlugin, routes, hooks, cron, MCP, admin page,
                         |                    container (builds the ports for one request)
          +--------------+--------------+
          v                             v
   adapters/emdash               adapters/stripe          the ONLY importers of `emdash` storage/content
   content + plugin storage      the ONLY importer        and of the `stripe` SDK
   schema, settings              of `stripe`
          \                             /
           +-------------+--------------+
                         v
                      services/          use cases (catalog sync, cart, checkout, settlement, refunds, ...)
                         |
                         v
                       ports/            interfaces: PaymentProvider, repositories, stores, Clock, Mailer
                         |
                         v
                       core/             pure domain: money, catalog, cart pricing, order state machine,
                                         events, errors (no emdash, no stripe, no I/O)

   contracts/   options, HTTP API schemas, extension API (zod + types; importable by a storefront)
   testing/     in-memory ports, fake provider, fakes of the EmDash context, Stripe fixtures
```

The rule: **a layer imports only from layers below it.** `core` imports nothing but `core`; `ports` import `core`.
`services` talk to Stripe and to storage only through ports. Only `adapters/stripe` imports the `stripe` package (the
test fixtures import its types), and only `plugin/` and `adapters/emdash` call EmDash's content, storage and
settings APIs. `plugin/container.ts` is the composition root: it builds every port from one `PluginContext` and hands
the bundle (`CommerceContainer`) to the services. The Stripe provider is built lazily, so catalog reads work on a
site with no key yet.

Known exceptions in the current code (nothing enforces the rule mechanically, so these are the places to look when
tightening it):

- almost every service takes `CommerceContainer`, a *type* defined in `plugin/container.ts` (an upward import);
- `services/{inventory,refunds,payments/settlement-steps,catalog/sync-*}.ts` import `catalog-mirror.js` from
  `adapters/emdash` (the content-side mirror of stock and sync state);
- `services/{reconcile,admin/status,admin/webhooks}.ts` import the list `WEBHOOK_EVENT_TYPES` from
  `adapters/stripe/webhook-events.ts`;
- `services/maintenance.ts` imports the `KVAccess` type from `emdash`.

Web Crypto only (`globalThis.crypto`), no `node:crypto`, so the plugin can run on Workers. The Stripe client uses the
fetch HTTP client and `Stripe.createSubtleCryptoProvider()` for webhook verification.

Errors: services throw `CommerceError` (`core/errors.ts`, stable code + HTTP status); provider failures are
`ProviderError` (retryable flag). `plugin/http.ts` (`runRoute`) is the one place that turns either into a
`PluginRouteError`, because an EmDash route that returns an error object answers HTTP 200.

## Source of truth

| Data | Source of truth | Mirrored to |
| --- | --- | --- |
| Catalog (attributes, product types, brands, categories, products, variants, prices) | EmDash content; every link between two of them is a native relation | Stripe Products and Prices (one-way, products and variants as Products, prices as Prices). Drift in Stripe is detected and reported, never written back. |
| Managed prices (one `prices` entry per sellable) | the product `price` and the variant `price` override | the plugin keeps the entries in step (`services/catalog/managed-prices.ts`); the entries then follow the normal price sync |
| Sync state (`providerId`, price per terms fingerprint, last written payload, sync version, drift) | plugin storage `catalog_links` | `stripe_*` fields on variants and prices (display only) |
| Stock | plugin storage `inventory_levels` + `inventory_reservations` | `stock` field of variants (editors can edit it; see below) |
| Cart | plugin storage `commerce_carts` | `carts` collection (best-effort admin mirror) |
| Checkout snapshot (what the server put in the session) | plugin storage `checkout_snapshots` | none |
| Payment, refund, dispute, subscription state | Stripe, via events (webhook or reconciliation) | `orders`, `payments`, `subscriptions`, `customers` collections |
| Orders (three status axes, lines snapshot), payments, subscriptions, customers | content collections (plugin-owned); their links are native relations | none |
| Order timeline | the hidden `order_events` collection (append-only, written only by `recordOrderEvent`) | none |
| Order number counter | plugin KV `state:order-seq:<year>` (compare-and-set) | the number on the order |
| Refund requests | plugin storage `refunds` (recorded before Stripe is called) | the order's `refunded` total comes from Stripe's cumulative figure |
| Exactly-once keys and lookups (order by session, payment by PI, customer by email, ...) | plugin storage `record_index` | none |
| Webhook events, domain events | `webhook_inbox`, `event_outbox` | none |

Why content for orders: editors need them in the admin (listing, search, revisions). Why storage for machine state:
only storage has atomic guarded updates (`compareAndSet`, `updateIf`), and EmDash content writes are
last-writer-wins.

A browser never decides payment state. A collection with revisions stages plugin writes as a draft, so the plugin
never writes `products` on its own initiative (the Specification panel saves `specs` when an editor presses save; see `.ai/memory/emdash-plugin-stripe-draft-staging.md`).

## Concurrency primitives

EmDash 1.5 has no cross-document transactions. Everything is built from single-row primitives:

| Primitive | Where | Used for | Why |
| --- | --- | --- | --- |
| `compareAndSet(id, null, doc)` create-if-absent | `webhook_inbox.record` (event id), `inventory.reserve` (reservation id), `record_index.claim`, outbox enqueue | "exactly once" gates | One winner among concurrent callers, on SQLite and Postgres alike. |
| Revision CAS (`getVersioned` + `compareAndSet(id, revision, next)`) | `updateWithCas` (`adapters/emdash/storage/cas.ts`), carts, catalog links, outbox state, webhook inbox transitions | read-modify-write on one document | A lost race re-reads and re-applies. A serialization error from storage is retried (`withSerializationRetry`). |
| `updateIf` with a guard | `inventory_levels` (`available >= qty` in the same statement as the decrement), rate limiter (`count < limit`) | atomic counters | N concurrent buyers of the last unit cannot oversell. The guard must be at least as strict as the delta (EmDash does not clamp). |
| Claim (`record_index.claim`) | order by session id, payment by PaymentIntent, customer by email, subscription by Stripe id, order number, `customer:counted:`, `refund:restocked:`, `order:stock-adjusted:`, dispute state | exactly-once creation and exactly-once side effects | The winner creates the record and calls `set(key, recordId)`; losers get the id (waiting briefly) or the call is retried by the inbox. An unfinished claim becomes stale after 5 minutes (crashed winner) and can be taken over. |
| Leases | webhook inbox (`INBOX_LEASE_MS` 60 s), outbox deliveries (`OUTBOX_LEASE_MS` 60 s, pushed into `nextAttemptAt`) | one worker per event or delivery | A dead worker's event becomes due again when the lease expires; a double run is harmless because handlers are idempotent. |
| Record lock (`withLock`, `services/locks.ts`) | order, payment, customer, subscription, and the managed prices of one product tree (`LOCK_KEY.managedPrices`) | read-modify-write on content rows | Content `update` is last-writer-wins per column, so two handlers changing one order (a refund event and a dispute event) could overwrite each other. The lock is a `record_index` claim on `lock:<kind>:<id>`; waiters poll up to 8 s, then `LockBusyError` (the inbox retries). |
| KV compare-and-set | schema lock and marker, migrations lock, webhook cursor (monotonic), reconcile throttle slot, order sequence counter | process-level coordination (the counter hands each year's next number to exactly one caller; a caller that dies leaves a gap, never a duplicate) | Two cold starts or two overlapping cron runs agree on one winner. |
| Deterministic ids | refund id `rf_` + SHA-256(orderId, requestId), event ids `${type}:${sourceId}`, idempotency keys | replay safety | A repeated request or a replayed webhook reaches the same record or Stripe object. |

The order lock is the rule for orders: **every order mutation goes through `applyOrderEvent` / `transitionLocked`
(`services/payments/order-transitions.ts`) under `withOrderLock` and re-reads the row inside the lock.** Nothing else
writes an order's payment status, totals or review flags. The human-driven axes (`performOrderAction` for the lifecycle,
`setFulfillment` for fulfillment, `services/admin/order-actions.ts`) take the same lock, re-read the order inside it,
check the pure guard (`core/order-lifecycle.ts`), update, record a timeline entry and then announce a domain event.

## Flows

### Catalog sync

Triggers: `content:afterSave` for products, variants and prices; `afterPublish`/`afterUnpublish` (products);
`beforeDelete` + `afterDelete` (trash); the admin "Resync" (`admin/catalog/resync`) and the editor action "Sync to
Stripe"; cron retries of failed links; and checkout itself (`ensurePricesSynced`) for a price whose link is not servable.

0. **Before the sync, after a save**: relation selections are invisible to `content:beforeSave` (the host gives that hook
   field values only), so what depends on them runs in `content:afterSave`: a variant's derived `options_key`, title
   and SKU (`deriveVariantFields`), the exactly-one-parent check of a price (`checkPriceLinks`; an invalid price is marked
   `failed` and never sent), and `syncManagedPrices` (the managed price entries follow the product / variant `price`).
   `afterPublish` settles the managed prices again, because publishing makes the draft's price live.
1. The hook marks the entity and its dependents `pending` in `catalog_links` and **bumps the link's `syncVersion`**
   (`markPending`), then syncs inline. A hook failure is logged only (`content:after*` run after the response); the
   link stays `pending`/`failed` and cron retries it with exponential backoff (30 s up to 30 min).
2. Products and variants (`writeProviderProduct`): adopt an existing Stripe Product by metadata search
   (`emdash_entity = product:<id>` / `variant:<id>`) before creating one; an unchanged payload (strong hash of what
   is written) makes no call; otherwise update.
3. Prices (`syncPriceEntity`): Stripe prices are immutable in amount, currency and recurrence. The link keeps a map
   `terms fingerprint -> Stripe price id` (`priceTermsFingerprint`: amount, currency, type, interval, interval count,
   tax behaviour). Changed terms look the fingerprint up (reuse after a revert) or create a new Price, then archive the
   previous one (`transfer_lookup_key` moves the lookup key). Nickname, lookup key and `active` are updated in place.
   Only a published product with an active variant and price is `active` in Stripe.
4. **Idempotency keys** carry what makes a call distinct: create keys use the entity key or price id plus the terms
   fingerprint; update/archive/reactivate keys carry the link's `syncVersion` and a payload hash
   (`services/catalog/idempotency.ts`). Stripe replays a key's cached response for 24 h, so an identical payload sent
   for a *later* intent (archive, reactivate, archive again) must not reuse an earlier key; a retry of the same attempt
   keeps its version and therefore its key.
5. A successful sync writes the Stripe ids and `synced` into the variant/price content fields (the mirror;
   `catalogMirror` writes variants and prices, never products). A failure stores the error on the link, emits
   `catalog.sync_failed` and writes `failed` to the mirror.
6. **Drift** (`product.*` / `price.*` events): the snapshot is compared with what the plugin last wrote
   (`link.lastWritten`), not with current content, so an edit waiting for its sync is not drift and the echo of our own
   write is not either. Differences are stored on the link and announced once per distinct set
   (`catalog.drift_detected`). The admin "Resync" (`force`) rewrites the object.
7. Deleted content: after a trash neither the entry nor anything hanging off it is readable, so `beforeDelete`
   (`prepareDelete`) marks the entity's dependents pending while they can still be listed and `afterDelete`
   (`archiveDeleted` + `processDue`) settles every due link by link: `active: false` on the Stripe object, nothing else.
   A link whose entity is gone and that never reached Stripe is settled without a call; cron settles whatever the hook
   could not. An inactive variant's managed price is archived and restored on reactivation
   (`catalogMirror.writePriceActive` for the entry of a trashed variant).

Editor stock: saving a variant with a changed `stock` becomes a delta against `mirroredOnHand`
(`variantStockDelta` in `plugin/hooks.ts`), so sales since the last mirror survive.

### Cart and checkout

- **Cart.** `cart/lines` loads the cart behind the bearer id (or builds a fresh unsaved one), applies the change
  (`add`/`set`/remove) and stores it with a revision CAS (up to 10 rounds). A line may be added only if its price,
  product and variant are active and its currency is supported. Pricing (`core/cart-pricing.ts`) is pure: issues
  (`PRICE_NOT_FOUND`, `OUT_OF_STOCK`, `MIXED_CURRENCY`, `NOT_SYNCED`, ...), currency, subtotal, mode. `validateCart`
  adds issues and blocks checkout.
- **Checkout** (`services/checkout.ts`), per attempt (three rounds on a lost race):
  1. Reuse an open session that was made for the same lines and UI mode (double click, two tabs, retry).
  2. If another request holds the cart's *pending claim* (`checkout.sessionId === ""`), poll (200 ms, up to 40
     times) for its session; a claim older than 90 s is taken over.
  3. Otherwise close a stale open checkout (`unlockCheckout`: refuses with `CART_LOCKED` if the session already
     completed; expires the Stripe session, releases the reservation), price the cart, run
     `ensurePricesSynced`, apply `customizeCheckout`.
  4. **The cart CAS decides the one winner**: flipping the cart to `checkout_open` with a pending claim. The winner
     reserves stock (all lines or none), writes the **snapshot** (before the session exists, so a webhook can never
     arrive for a session without one), creates the session with idempotency key
     `stripe-commerce:checkout:<checkoutId>`, stores the url / client secret on the snapshot and finalises the cart
     with a second CAS. If that CAS is lost (a line changed meanwhile) the session is expired and the reservation
     released, and the request decides again. Any failure compensates (release, expire) and reopens the cart.
- **Reservation lifetime = session lifetime** (`checkout.sessionMinutes`). Expiry: `checkout.session.expired` or the
  cron sweep releases the hold and puts the cart back to `active`.
- **Abandoned checkouts** (`services/checkout-sweep.ts`, cron step `checkout-sweep`, admin "Clean up abandoned
  checkouts", MCP `commerce_checkouts_sweep`). The release above leaves the records behind, so once a session ended
  (its stored expiry) and `checkout.abandonedRetentionHours` (default 48, because an async payment can settle after the
  session ended) passed, the sweep (a session Stripe already closed counts as ended when the retention is 0) with no
  order for the session: closes the session if still open (a `complete` one is
  left to settlement), releases a still-held reservation, deletes the checkout snapshot, the released reservation
  record (once it has been released for the retention time) and an anonymous (no email) idle cart, or reopens a cart that has an email. Snapshots of paid checkouts are
  kept 30 days, reservations of orders stay. Bounded per run (100 snapshots per page, five pages).
- The session carries only ids in metadata (`emdash_cart_id`, `emdash_checkout_id`, `emdash_plugin`, `ext_*` from
  extensions). Amounts, lines and customer are never trusted from the client.

### Inventory

`inventory_levels` holds `onHand`, `reserved`, `available` (= onHand - reserved) per sellable (`product:<id>` or
`variant:<id>`); a sellable that does not track stock has no row and is never refused. `reserve` creates the reservation
record first (CAS from absent, so the same id is a retry), then takes lines one by one with `available >= qty` guarded in
the same statement; when a later line fails the earlier ones are given back. `commit` and `release` flip the record's
status with a CAS first (the exactly-once gate) and then apply the counters. A crash between the two leaves units
reserved (conservative: never oversells) and nothing in the code re-applies the counters afterwards; an admin
adjustment is the manual repair. Expired holds are released by the cron sweep, which also reopens the carts waiting on
them. Alerts (`inventory.low_stock` / `out_of_stock`) are published after a commit or an adjustment.

### Settlement (exactly once)

`checkout.session.completed` and `async_payment_succeeded` both run `handleCheckoutSettled`
(`services/settlement.ts`):

1. Retrieve the session fresh from Stripe (the event only names it). Ignore sessions without the plugin's metadata;
   throw (retry) if it is not `complete`.
2. Load the server-side snapshot. `reviewFlagsForSession` compares currency, line items (price id + quantity) and
   subtotal with the snapshot, plus livemode; a difference **flags** the order (`amount_mismatch`,
   `line_items_mismatch`, `currency_mismatch`, `missing_snapshot`, `livemode_mismatch`) and never drops it, because
   the customer paid.
3. **Exactly-once creation:** a claim on `order:session:<sessionId>`. The winner upserts the guest customer, builds
   the lines snapshot (title, variant title, SKU and option labels from the catalog at that moment, amounts from the
   session; product, variant and price ids kept as text), allocates a unique order number (the configured
   `orders.numberFormat` over the per-year KV counter, or the `generateOrderNumber` extension; a claim per candidate,
   max 5 tries), creates the order as `pending` with lifecycle `open` and fulfillment `unfulfilled`, and indexes it. A
   winner that died between create and index leaves an orphan; the next winner finds it by scanning recent orders
   before creating another.
4. **Follow-ups are idempotent and repeated on every pass** (`finishSettlement`): bring the status to what the
   session proves (`pending/failed -> paid` via the order lock), record the payment (PaymentIntent) or the
   subscription and its first invoice, commit the stock reservation (or, when the hold had already expired for a late
   async payment, decrement stock once and flag `inventory_shortfall` if that drives it negative), convert the cart,
   count the order for the customer once, publish `order.created` / `order.paid` / `order.payment_failed` /
   `cart.converted` / `customer.created` / `order.needs_review` with deterministic ids. A crash at any point leaves
   an order the next attempt finishes, never a second one.
5. `checkout.session.async_payment_failed` remembers the failure per session (it can precede the order), fails the
   order and releases stock.

The payment axis (`payment_status`) is one pure function, `transitionOrder` (`core/order-state.ts`): `pending -> paid | failed |
cancelled`, `failed -> paid`, `paid/partially_refunded -> partially_refunded | refunded | disputed`, `disputed ->
<status before> | dispute_lost`; terminal: `refunded`, `dispute_lost`, `cancelled`. An event that is not allowed from
the current status leaves it unchanged, so late, replayed and out-of-order events converge.

### Refunds

`requestRefund` (`services/refunds.ts`): the refund id is `rf_` + hash(orderId, requestId). Under the order lock it
validates (status paid / partially refunded, a succeeded payment exists, amount <= total - refunded - in-flight),
stores the optional restock plan and **records the refund as `pending` before Stripe is called**. Then it calls Stripe
with idempotency key `stripe-commerce:refund:<refundId>`, so a repeat of the request, or a retry after a crash
between record and call, reaches the same Stripe refund. A definitive (non-retryable) rejection marks the record
`failed` and frees the amount; a retryable failure leaves it pending for a repeat. The answer, and every
`refund.created|updated|failed` event, goes through `applyProviderRefund` in one locked section: merge the refund
status (a final status never reverts), retrieve the PaymentIntent, set the order's `refunded` total from Stripe's
**cumulative** `amountRefunded` (never a delta) and let `transitionOrder` pick the status; afterwards, once per
successful refund: restock (claim) and `order.refunded`. Refunds made in the Stripe dashboard are recorded on sight.

### Disputes

`handleDisputeUpdated`: an open dispute moves a paid/partially refunded order to `disputed`, remembering the status
it came from; won restores it (and re-applies a refund that landed meanwhile); lost is final. The dispute's last
state is a record-index entry, so a late `open` event cannot reopen a closed dispute, and a closing event for a
dispute whose open event was lost opens it first. Events: `order.disputed`, `order.dispute_closed`.

### Subscriptions and invoices

Subscription records mirror Stripe one to one (Stripe owns the lifecycle). Events apply in provider time order: an
event older than `providerUpdatedAt` is dropped; state fetched fresh (settlement, a cancel call) does not move that
watermark. Invoice events carry no payment links in their snapshot, so `handleInvoice` always `retrieveInvoice`s;
it ensures the subscription record first (an invoice event can beat the subscription's own). A paid invoice's
PaymentIntent becomes a `payments` record (`subscription_create` invoice -> the initial order's payment, others ->
renewal + `invoice.paid`); a failed invoice only emits `invoice.payment_failed` (the status change arrives as a
subscription event). Subscription periods live on items in this API version and are mapped in
`adapters/stripe/mappers/subscription.ts`.

### Webhook inbox

```
 received --claim(lease 60 s)--> processing --ok--------------------> processed
    ^                               |   \--unsupported / other mode--> ignored
    |                               \--error--> failed --backoff, retry--> processing ...
    |                                              \--attempts >= maxAttempts--> dead
    \---------------- replay (admin / MCP: requeue, attempts = 0) <-------------/
```

1. The route verifies the signature on the exact raw body (Web Crypto HMAC, 5 min tolerance) and normalises the event
   into a provider-neutral `WebhookAction`; an object that cannot be mapped becomes `unsupported` with the raw event
   intact (throwing would fail identically on every Stripe retry for three days).
2. `inbox.record` creates the document by event id (CAS from absent), so a duplicate delivery is one record.
3. `processInboxEvent`: take the lease; ignore events whose livemode does not match the key's prefix; run the built-in
   handler for the action (`services/payments/dispatch.ts` is the only place that knows every action kind); run the
   site's `stripeWebhooks` extensions (10 s timeout each); mark processed. Any failure is recorded with backoff
   (30 s, 2 min, 8 min, 32 min, 2 h, then 6 h) and `dead` once `webhooks.maxAttempts` is reached.
4. Status codes are the contract with Stripe: 503 no secret yet, 400 bad signature, 200 handled/duplicate/ignored,
   500 failed (Stripe retries as well as cron). Only a handled event advances the reconciliation cursor.
5. Cron picks up due events (a fresh `received` event after a 2-minute inline grace; `failed` when its backoff has
   elapsed; `processing` with an expired lease).
6. **Reconciliation** (`services/reconcile.ts`): list Stripe events after the cursor minus a 5-minute overlap
   (or the last hour on first run), oldest first, filtered to the handled types in slices of 20 (the `events.list`
   `types` limit), record the ones the inbox never saw and run them through the same pipeline. Bounded per run (100
   new events, 1000 scanned; `isTruncated`). From cron at most every 15 minutes, claimed with a KV CAS so overlapping
   runs do not both reconcile; from the admin on demand.

### Subscribers and the outbox

Domain events (`core/events.ts`) are written to `event_outbox` with one delivery record per interested subscriber
(built-in email subscriber `builtin-emails` plus the site's), idempotent on the event id, then delivered inline.
Each delivery is `pending -> delivered | failed (backoff) -> dead` (8 attempts), has a 5 s timeout, and is leased
(`nextAttemptAt` pushed 60 s out) so two workers do not deliver it twice. Delivery is **at-least-once**: a
subscriber must be idempotent on `event.id`. A failing subscriber never blocks another. A subscriber removed from
the config runs out of attempts and dies; `outbox/retry` revives it. Events whose ids are deterministic
(`order.paid:<orderId>`) are re-published on every settlement pass, which is how a crash after the writes still emits
them exactly once from the subscribers' point of view.

### Guest access

Signed tokens (`services/access-tokens.ts`): `base64url(JSON{v, oid, scp, exp}) . base64url(HMAC-SHA256(secret, body))`,
scopes `order:view` and `portal` (a view-only link cannot open the portal), constant-time compare, one generic 401 for
anything wrong. `orders/access-link` always answers `{ isAccepted: true }` and emails a link only when order number and
email match; it is rate limited per IP (route) and per hashed email (service).

## Native relations

Every link between two plugin collections is a native EmDash relation (`_emdash_relations`, edges in
`_emdash_content_references`), declared as data next to the collections: `RelationDefinition` (slug, parent and child
collection, labels, `maxChildrenPerParent`, `maxParentsPerChild`) in `schema/collections/{catalog,sales}.ts`, and a
`relationField(slug, label, relationSlug, side)` on each end (`validation.relation` + `relationSide`; the parent side is
the picker that lists children, the child side the one that selects parents). The admin renders both ends as an ordered
list with a search picker. Relation slugs are in `CATALOG_RELATION` / `SALES_RELATION` (`schema/field-names/`).

What EmDash 1.5 does with them, and what that means for the code:

- **Relation-bound fields have no column.** `ctx.content.create/update` refuses them, `ctx.content.get/list` never
  return them and `fieldFilters` cannot filter on them. So the plugin goes through **`RelationsPort`**
  (`adapters/emdash/relations/port.ts`, implemented over EmDash's exported content handlers in `emdash-relations.ts`,
  in memory in `testing/in-memory/relations.ts`; one contract suite pins both): `children`, `fields` (several fields of
  one entry in one read), `parentOf`, `setChildren` / `setParent` (replace the **whole** set, in order, visible at once,
  no draft staging) and `createWithReferences` (create an entry together with its links, for plugin-owned records; content
  hooks and draft staging are bypassed). Failures throw `RelationError`.
- **One page of 50.** A read returns at most `RELATIONS_PAGE_SIZE` (50) links and no cursor; `hasMore` says the rest was
  cut off. Relations whose size the plugin must read completely are therefore bounded to 50 (`CATALOG_LIMITS`: variants
  and prices per sellable, values per attribute, specification attributes per type, categories per product) or 3 (axes
  per type). A catalog read that meets more throws `CATALOG_LIMIT_EXCEEDED`. Unbounded links (orders of a customer,
  payments and events of an order) are never read through the relation; an indexed scalar id (`order_id` on payments and
  order events, `email` on orders) answers those queries.
- **Live reads hide unpublished children**: the public catalog reads with `includeDrafts: false`; the plugin's own checks
  (publish guard, derived variant fields, managed prices) read with `includeDrafts: true`, which returns the selection still
  staged in a draft.
- **A self relation works** (`product_categories`: `categoryTree`, parent and subcategories), so the category tree is one
  collection.

## Catalog model

Pure rules live in `core/catalog-rules.ts` and `core/product-type.ts`; the services apply them.

- **Vocabulary.** `attributes` (input type `select`, `multi_select`, `text`, `number`, `boolean`; presentation `buttons`,
  `swatch`, `dropdown`) own ordered `attribute_values` (relation, edited from the attribute). A `product_types` entry
  picks up to 3 select attributes as **variant axes** (optionally narrowing the allowed values per axis), plus
  **specification attributes** and the subset that is **required**.
- **Variants.** A variant has exactly one value per axis. `options_key` is the sorted value ids joined by `|`, unique per
  product; it is derived after the save (`deriveVariantFields`), protected from editing, and checked by the publish
  guard. Title (`Product - M / Black`) and SKU (`PRODUCT-M-BLK`, from value codes) are derived when empty. Uniqueness is a
  check, not an index (EmDash has no compound unique constraint), so two concurrent saves of one product can race.
- **Generator.** `services/catalog/variant-generator.ts` builds the cartesian product of the ticked values per axis,
  skips existing `options_key`s and refuses to exceed 50 variants; the Variants panel is its only caller.
- **Specification.** The values live in the protected `specs` JSON of the product, keyed by attribute id (select: a value
  id, multi-select: ids, text, number, boolean); `reshapeSpecs` drops rows of attributes the type no longer lists.
- **Publish guard.** `content:beforePublish` and `content:beforeSchedule` (capability `hooks.content-policy:register`)
  call `productPublishProblems` and cancel with a readable reason. It lives in a policy hook because the field-level
  `content:beforeSave` sees field values but no relation selections. `content:beforeSave` still runs the protected-field
  guard and `catalogSaveProblems` (swatch colour format, price and price override as non-negative whole minor units).
- **Managed prices.** `syncManagedPrices` converges the `prices` entries flagged `is_managed`: a simple product has one
  (amount = product `price`), a product with variants one per active variant (amount = override, else the product
  price) and none on the product. The entry is created once (`createWithReferences`) and then updated, found by relation
  + flag, under one lock per product tree; a stray duplicate is archived. `is_managed` is protected, and while it is
  set the money and activation fields are read-only too (`managedLock` in `schema/protected-fields.ts`). The write fires
  no hooks, so the caller runs the Stripe sync afterwards (an amount change creates a new Stripe Price and archives the
  old one, see Catalog sync).
- **Default price.** `selectDefaultPrice` (`core/price-selection.ts`) is the one rule every read uses: an active
  explicit default that is not managed, else the active managed entry, else the cheapest active one-time price, else the
  cheapest active price; ties by id.

## Order model

An order has three axes that never write each other: `payment_status` (provider events, `transitionOrder`),
`order_status` (lifecycle: `open`, `completed`, `cancelled`, `archived`; admin actions, `planOrderAction`) and
`fulfillment_status` (admin, `planFulfillmentChange`). The lines are a scalar repeater snapshot on the order; a repeater
takes scalars only, so product, variant and price ids are plain text, and every sub-field is optional.

**Timeline.** `recordOrderEvent` (`services/order-events.ts`) is the only writer of `order_events`. An entry is idempotent
on its source key (`orderEventSourceKey`: order id, type and the provider event or transition it describes): the key is
claimed in the record index first, so a retried webhook or two concurrent writers store one entry. Settlement, order
transitions, refunds, disputes and emails use `tryRecordOrderEvent`, which logs and swallows a failure (the audit trail
must not fail a webhook); admin actions surface the error. The Timeline editor panel and `admin/orders/events` page
through it, newest first.

**Numbers.** `orders.numberFormat` (`{PREFIX}`, `{YYYY}`, one `{seq:N}`; `core/order-number.ts`) over a per-year KV counter
(`allocateOrderSequence`, compare-and-set with retry); the number is also claimed in the record index.

## Editor panels and actions

EmDash lets a native plugin without a React admin entry declare Block Kit **editor panels** and **editor actions** per
collection (`admin.editorPanels`, `admin.editorActions`, built from the configured slugs in `plugin/admin.ts` and
`plugin/editor/`). Without a `collections` scope a panel would show on every collection of the site. A panel is a
private POST route (`ROUTE.editor*`) that receives `panel_load`, `block_action` or `form_submit` and returns blocks plus an
optional toast and `refresh`; an action returns `{ toast, refresh }`. The entry the panel was opened on comes from
`ctx.ui.entry`, attested by the host. A plugin with a React admin entry would lose both extension points (and the Commerce
page is Block Kit), which is why the panels stay Block Kit. The panels are: Variants and Specification (products), the
"Sync to Stripe" action (products, `plugins:manage`) and Timeline (orders).

## Media

`adapters/emdash/content/media.ts` turns an `image` field value into a URL (`resolveMediaImage`, `resolveGallery`). A
media-library value has no `src`: it is `{ provider: "local", id, meta: { storageKey }, width, height }` and its public URL
is `/_emdash/api/media/file/<storageKey, else id>` (each path segment encoded). An external value carries its own `src`;
any other provider's URL is built by a provider module the plugin cannot load, so only an explicit `src` / `url` is
trusted. `gallery` is a repeater of `image` + `alt`, both optional. Storefront order: product image, product gallery, then
each variant's image and gallery, de-duplicated by URL. Stripe still gets the product image only, and only an absolute https URL.

## Schema reconciler and migrations

EmDash has no plugin upgrade hook, and `applySeed(..., { onConflict: "skip" })` adds nothing to an existing collection,
so a new release's collections, relations and fields would never reach an existing database. The reconciler
(`adapters/emdash/schema/reconcile.ts`, v2) is a layer over `applySeed`: it diffs the definitions in
`schema/collections/` against the database and applies only what is missing, in one seed
(`registry-port.ts` builds it): missing relations first, then missing collections whole (fields, relation-bound fields,
placement, `hidden`), and for an existing collection only the fields it lacks. For an existing collection the seed
carries what is stored (label, `supports`, placement and every field it has), because `onConflict: "update"` rewrites
the collection row from the seed; fields the seed does not list are never touched. Added fields on an existing
collection are never required. It never alters, renames or deletes, so a customisation an editor made survives. Sidebar
placement and `hidden` are applied only to a collection that has no folder and no position yet; one an admin placed keeps
both.

It runs on install/activate and lazily on first use in each process (`container.ensureReady()`), guarded by a KV lock
(60 s TTL, stale takeover) and a KV marker holding a fingerprint of the definitions (collections, field slugs and types,
relation slugs and limits, placement, `hidden`), so a warm start costs one KV read. Bump `SCHEMA_VERSION` (now 2) to
force a re-check.

`schema/migrations.ts` holds numbered, run-once **data** migrations (`0001-baseline`, and `0002-optional-option-sub-fields`,
which is a no-op now that the option repeaters are gone), run in id order under a KV lock; success writes
`state:migration:<id>`; a failure is logged, stops later migrations and is retried on the next activation or first use. A
failing migration never disables the plugin. Changing an *existing* field (its validation, a renamed value) is a data
migration (`SchemaPort.setFieldValidation`), never the reconciler.

Storage indexes are declared per collection in `adapters/emdash/storage/declaration.ts`; EmDash rejects a query on an
undeclared field, and the fake storage in `testing/` enforces the same rule.

## File map

```
src/
  index.ts                  public exports (plugin factory, extension API, contracts, domain types)
  core/                     money, catalog, catalog-rules, product-type, price-selection, cart, cart-pricing, order,
                            order-state, order-lifecycle, order-timeline, order-number, payment, subscription, customer,
                            inventory, events, errors, ids
  ports/                    payment-provider.ts (PaymentProvider + normalised webhook actions),
                            repositories.ts (all persistence ports, RECORD_INDEX_KEY), due.ts
  contracts/                options.ts, api.ts (ROUTE, zod schemas, cart header/cookie), extensions.ts
  services/
    catalog-sync.ts, catalog/*       sync, drift, idempotency keys, link state; the catalog model: derive-variant,
                                     variant-generator, specs, managed-prices, price-links, publish-guard, save-checks,
                                     axes, editor-read
    catalog-read.ts, storefront/*    public reads: cards, detail, listing, stock states, media, loading
    cart.ts, cart/*                  cart use cases, pricing loader, lifecycle
    checkout.ts, checkout/*          checkout, session reuse, customization, redirect URLs, status
    inventory.ts, inventory/*        reserve, release, availability, stock alerts
    settlement.ts, payments/*        settlement, order transitions, invoices, payment records, shared deps
    refunds.ts, disputes.ts, subscriptions.ts, customers.ts, payments.ts
    order-events.ts                  the order timeline writer and reader
    webhook-inbox.ts, reconcile.ts   pipeline, replay, reconciliation
    outbox.ts, subscribers/*, emails/*   event delivery, built-in email subscriber, templates
    access-tokens.ts, orders/guest.ts    guest links, order view, portal
    admin/*                          admin use cases (status, orders, order actions, inventory, webhooks)
    maintenance.ts, locks.ts         cron steps, record lock
  adapters/
    emdash/  content/ (mappers, repositories, catalog mirror, media resolver), relations/ (RelationsPort and its EmDash
             implementation), storage/ (stores, CAS helpers, order sequence, declaration),
             schema/ (collections/{catalog,sales,shared}, field-names/, protected-fields, guard, reconcile,
             registry-port, migrations), real-host/ (tests against a real SQLite EmDash), settings.ts, constants.ts
    stripe/  client.ts, provider.ts, catalog.ts, checkout.ts + checkout-params.ts, payments.ts, customers.ts,
             subscriptions.ts, webhooks.ts + webhook-events.ts (normalisation), mappers/, errors.ts, metadata.ts
  plugin/                   index.ts (definePlugin), container.ts, http.ts (boundary), route-builder.ts, routes/*,
                            hooks.ts, cron.ts, mcp.ts, admin.ts + admin-page/, editor/* (Block Kit panels), options.ts
  testing/                  in-memory/ (incl. relations), fakes/, fake-provider.ts, fixtures/stripe/, contracts/ (shared port suites)
  astro/, blocks/           storefront-side Portable Text `product` block (not part of the commerce core)
```
