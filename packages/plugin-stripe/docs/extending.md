# Extending the plugin

Two audiences. A **site** customises behaviour through the extension API (section 1) without touching the package. A
**contributor** changes the package (sections 2-4); read `docs/architecture.md` first, and the rules in section 5
before opening a pull request. Paths are relative to `packages/plugin-stripe/src`.

## 1. Site extensions

Extensions are functions, and descriptor options are JSON, so a site passes them through its own plugin entrypoint
(see the README, "With extensions"):

```ts
// src/commerce/extensions.ts
import { defineCommerceExtensions } from "@emdash-commerce/plugin-stripe";

export const extensions = defineCommerceExtensions({
  subscribers: [/* section 1.1 */],
  validateCart: async (cart, ctx) => [/* 1.2 */],
  customizeCheckout: async (defaults, input, ctx) => defaults,
  generateOrderNumber: ({ placedAt, prefix }) => `${prefix}-${placedAt.getUTCFullYear()}-0001`,
  emails: {/* 1.4 */},
  stripeWebhooks: {/* 1.5 */},
});
```

Extensions run inside the plugin's trusted process and get an `ExtensionContext`: `log`, `storeName`, `siteUrl` and
read-only `getOrder`, `getCustomer`, `getSubscription`. There is deliberately **no provider client and no writer**:
money and system operations have two entry points only, the private admin routes and the MCP tools (both behind
EmDash's permission check). A site reacts to events and calls the HTTP routes; it does not reach into services.

### 1.1 Subscribers (domain events)

```ts
import { defineSubscriber } from "@emdash-commerce/plugin-stripe";

export const notifyFulfilment = defineSubscriber({
  id: "fulfilment-webhook", // stable: delivery state is tracked per id; renaming re-delivers history
  events: ["order.paid", "order.refunded"],
  async handle(event, ctx) {
    const order = await ctx.getOrder(event.data.orderId);
    if (!order) return; // nothing a retry could fix
    // Idempotency key = event.id. The same event can arrive again (at-least-once).
    await fetch("https://fulfilment.example/orders", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": event.id },
      body: JSON.stringify({ number: order.orderNumber, type: event.type, lines: order.lines }),
      signal: AbortSignal.timeout(4_000),
    });
  },
});
```

Rules of the delivery contract (`services/outbox.ts`):

- **At-least-once.** Events are written to a durable outbox in the step that changes state, then delivered inline and
  retried from cron. Make the handler idempotent on `event.id` (event ids are deterministic: `order.paid:<orderId>`).
- **Timeout 5 s per call** (`OUTBOX_DELIVERY_TIMEOUT_MS`). A slower handler is treated as failed and retried, although
  it may still finish: another reason for idempotency. Do slow work by queueing it somewhere durable.
- **Failure = throw.** A thrown error (or rejected promise) schedules a retry with backoff (30 s, 2 min, 8 min, ...);
  the 8th failure parks the delivery as `dead` (visible on the admin page; `commerce_outbox_retry` revives it).
- **State is per subscriber id.** One failing subscriber never blocks or repeats another. Ids must be unique
  (a duplicate of a built-in or earlier id is ignored and logged). The built-in `builtin-emails` is reserved.
- A subscriber only sees ids and small facts; load the record with `ctx.getOrder` etc. Event types and payloads:
  `docs/api.md`.
- Removing a subscriber from the config leaves its pending deliveries to run out of attempts.
- The `Order` a subscriber loads has three status fields: `paymentStatus` (provider-driven), `orderStatus` (lifecycle) and
  `fulfillmentStatus`; `status` is gone. `ORDER_STATUS` / `OrderStatus` remain as deprecated aliases of
  `ORDER_PAYMENT_STATUS` / `OrderPaymentStatus` (do not use them for the lifecycle). `lines` is the order's line snapshot
  (`OrderLine`: title, variant title, SKU, option labels, amounts, ids). `order.created` still carries the deprecated
  `status` (= `paymentStatus`) next to `paymentStatus` and `orderStatus`; `order.completed`, `order.cancelled`,
  `order.archived`, `order.reopened` and `order.fulfillment_changed` are emitted by the admin actions.

### 1.2 `validateCart`

```ts
import { CART_ISSUE } from "@emdash-commerce/plugin-stripe";

validateCart: async (cart) =>
  cart.subtotal && cart.subtotal.amount < 2000
    ? [{ code: CART_ISSUE.custom, priceId: null, message: "The minimum order is 20.00." }]
    : [],
```

Returned issues are appended to the priced cart (storefront sees them in `cart.issues`) and make
`isCheckoutReady` false, so checkout answers `CART_NOT_CHECKOUT_READY`. It runs on every cart read and on checkout,
so keep it fast and side-effect free. **A throwing `validateCart` fails the request with a generic 500**: it is part
of the decision, not best effort.

### 1.3 `customizeCheckout`

```ts
import { toCurrencyCode } from "@emdash-commerce/plugin-stripe";

customizeCheckout: async (defaults, { cart, customer }) => ({
  ...defaults,
  allowPromotionCodes: customer === null || customer.orderCount === 0,
  shippingRates: cart.currency === "eur"
    ? [{ displayName: "Parcel", amount: 590, currency: toCurrencyCode("eur"), deliveryEstimateDays: { min: 2, max: 4 } }]
    : defaults.shippingRates,
  metadata: { ...defaults.metadata, campaign: "autumn" }, // stored on the session as ext_campaign
}),
```

You get the defaults derived from the options and return the same shape; the plugin copies **exactly** the
`CheckoutCustomization` fields back and validates them (a rate must be in the cart's currency, metadata at most 20
entries / 30-char keys / 500-char values, countries two letters, trial 0-730 days). Anything else you return, such as
amounts, lines, URLs or the customer, is dropped. A malformed result or a throw is a generic 500. Shipping rates and
trials only apply in the matching Stripe mode (rates: payment mode; trial: subscription mode).

### 1.4 `generateOrderNumber` and `emails`

`generateOrderNumber({ placedAt, prefix })` must be **unique**: the plugin claims each candidate and retries with a
new call on collision (up to 5 times, then settlement fails and is retried). Use randomness, not a counter you hold
in memory. The guest lookup (`orders/access-link`) tries the number as typed and upper-cased.

`emails` replaces the built-in templates per message: `orderConfirmation`, `paymentFailed`, `refundIssued`,
`orderAccessLink`. They are synchronous and return `{ subject, text, html }`. A renderer that throws or returns a
malformed message falls back to the built-in template and is logged, so a broken template never stops a
confirmation. Start from the defaults and escape what you interpolate:

```ts
import { defaultEmailRenderers, escapeHtml, formatAmount } from "@emdash-commerce/plugin-stripe";

emails: {
  orderConfirmation(input) {
    const base = defaultEmailRenderers.orderConfirmation(input);
    return { ...base, subject: `${input.storeName} - thank you!`, html: base.html && `${base.html}<p>${escapeHtml("Free returns for 30 days.")}</p>` };
  },
},
```

### 1.5 `stripeWebhooks`

Raw Stripe events keyed by type (`"*"` for all), called **after** the built-in handling of the same event succeeded:

```ts
stripeWebhooks: {
  "payout.paid": async (event, ctx) => {
    const payout = (event as { data: { object: { id: string; amount: number } } }).data.object;
    ctx.log.info("Payout paid", { id: payout.id, amount: payout.amount });
  },
},
```

Two catches. (1) The endpoint is registered only for the events in `WEBHOOK_EVENT_TYPES`
(`adapters/stripe/webhook-events.ts`), so a type outside that list never arrives; to receive it, add it to the
endpoint in the Stripe dashboard (then the plugin records it as `ignored` for its own handling and still calls your
function; but pressing "Register webhook" later resets the endpoint's list to the plugin's own, dropping yours). (2) A throw (10 s timeout per call) makes the inbox **retry the whole event**, built-in handlers
included; they are idempotent, and yours must be too.

## 2. Adding a Stripe event type (contributor)

End to end, with an example: handle `invoice.marked_uncollectible` and emit a new domain event.

1. **Subscribe.** Add the type to `WEBHOOK_EVENT_TYPES` in `adapters/stripe/webhook-events.ts`. The registered
   endpoint and reconciliation (`events.list`, sliced to Stripe's 20 types per call) both use this list. Existing
   sites show `events_outdated` on the status page until someone presses "Register webhook" again.
2. **Normalise (adapter).** Stripe types stop here. Add a provider-neutral variant to `WebhookAction` in
   `ports/payment-provider.ts` and map the event in `toWebhookAction`:

   ```ts
   // ports/payment-provider.ts
   | { kind: "invoice_uncollectible"; invoice: ProviderInvoice }

   // adapters/stripe/webhook-events.ts, inside the switch
   case "invoice.marked_uncollectible":
     return { kind: "invoice_uncollectible", invoice: toProviderInvoice(event.data.object) };
   ```

   An object that throws while mapping is turned into `unsupported` (logged), never into a failing webhook.
   Remember what Stripe's snapshots lack: invoice events carry no payment links (use `retrieveInvoice`), subscription
   periods live on items, and an event is a snapshot that may be older than the object.
3. **Handle (service).** Return `HANDLED` or `ignored(reason)`; throw to have the event retried. Handlers must be
   idempotent (the inbox may run an event twice) and re-read what they mutate under the right lock.

   ```ts
   // services/payments/invoices.ts (next to handleInvoice)
   export const handleInvoiceUncollectible = async ({ container, publisher }: Deps, snapshot: ProviderInvoice): Promise<HandlerResult> => {
     const provider = await container.provider();
     const invoice = (await provider.subscriptions.retrieveInvoice(snapshot.invoiceId)) ?? snapshot;
     const providerSubscriptionId = invoice.subscriptionId ?? snapshot.subscriptionId;
     if (!providerSubscriptionId) return ignored("Invoice does not belong to a subscription");
     const subscription = await ensureSubscriptionRecord(container, providerSubscriptionId);
     if (!subscription) return ignored("Invoice belongs to a subscription this store did not create");
     await publisher.publish([
       makeEvent(container, "invoice.uncollectible", invoice.invoiceId, {
         subscriptionId: subscription.id, amount: invoice.amountDue, currency: invoice.currency,
       }),
     ]);
     return HANDLED;
   };
   ```
4. **Dispatch.** Add the case to `dispatchAction` in `services/payments/dispatch.ts`. The switch has no default, so
   TypeScript refuses to compile until every `WebhookAction` kind is handled.
5. **Domain event (if the effect is visible to sites).** Add the payload to `CommerceEventPayloads` in
   `core/events.ts` (ids and small facts; additive), and a row to `docs/api.md`. The event id must be deterministic
   (`makeEvent(container, type, sourceId, data)` -> `${type}:${sourceId}`) so a replayed webhook emits the same id.
6. **Fixture and tests.**
   - Capture a real payload in a Stripe sandbox (`stripe trigger invoice.marked_uncollectible`, or `stripe events
     resend <evt_id>` to a local listener), scrub it to example values, save it as
     `testing/fixtures/stripe/events/invoice.marked_uncollectible.json`, add the type to
     `STRIPE_FIXTURE_EVENT_TYPES` in `testing/fixtures/stripe/index.ts` and to `provenance.json` (`real`, `triggered` or
     `derived`).
   - `adapters/stripe/webhook-events.test.ts` checks that the fixture list equals `WEBHOOK_EVENT_TYPES` and that every
     type maps to its expected `kind`; add the expectation to `EXPECTED_KIND`.
   - A service test with the in-package harness (`services/payments/test-support.ts`): `createHarness()`, put the state
     in (`seedCheckout`, `paidOrder`, `h.provider.subscriptionsById` / `invoices` for provider objects), then
     `await h.deliver(event({ kind: "invoice_uncollectible", invoice }))` and assert on what the consumer sees: the
     outbox record `await h.container.outbox.get("invoice.uncollectible:<id>")`, the stored records, the
     `HandlerResult` (`INBOX_OUTCOME`). Cover the second delivery of the same event and an event for an unknown subscription.
   - Add a mutation check for the guard that matters (break it, watch the test fail, restore).

## 3. Changing the schema (contributor)

The schema is data: collections, relations and fields are plain definitions in `adapters/emdash/schema/collections/`
(`catalog.ts`, `sales.ts`, helpers in `shared.ts`), slug constants in `adapters/emdash/schema/field-names/`. The
reconciler (`schema/reconcile.ts`, a layer over EmDash's `applySeed`) adds what is **missing** to every database and never
alters, renames or deletes, so an editor's customisations survive. Read "Native relations" and "Schema reconciler" in
`docs/architecture.md` first.

### 3.1 Adding a field

Example: a plugin-owned `gift_message` on orders.

1. **Name it** in `field-names/sales.ts` (`ORDER_FIELD.giftMessage = "gift_message"`). Respect EmDash's reserved slugs (`id`,
   `slug`, `status`, `created_at`, `updated_at`, `published_at`, `version`, ...): that is why orders use `order_status` and
   `placed_at`.
2. **Define it** in `collections/sales.ts` (`text(ORDER_FIELD.giftMessage, "Gift message")`). Add `indexed: true` only if you
   will filter by it (`fieldFilters` need indexed scalar fields; `unique` adds a constraint an existing database cannot
   always take). Mark it `isProtected: true` when only the plugin may write it. Do **not** change or remove an existing
   field. An added field on an existing collection is never required, even when its definition says so.
3. **Reconciliation is automatic and additive.** The definitions' fingerprint changes, so the next start runs the
   reconciler, which adds the missing field to existing databases. Existing rows simply lack the value: the mapper must
   default it. No migration unless old rows need a backfill (3.6).
4. **Protection is derived** (`schema/protected-fields.ts`). Every field of a plugin-owned collection is protected from
   editor changes except `EDITABLE_ORDER_FIELDS` (today only `notes`); on catalog collections the `stripe_*` fields and
   every field with `isProtected` are protected, and a managed price entry (`is_managed`) is locked for its money and
   activation fields (`managedLock`). To make a new order field editor-editable, add it to `EDITABLE_ORDER_FIELDS`. Tests:
   `schema/guard.test.ts`, `schema/collections.test.ts` (it also checks that every field name a mapper uses has a field).
5. **Map it** in `adapters/emdash/content/record-mappers.ts` (orders, payments, ...) or `catalog-mapper.ts` (catalog):
   read it in `toOrder` (`asString(d[ORDER_FIELD.giftMessage])`), write it in `orderPatchToData` (`compact` skips
   `undefined`, so a patch that does not mention it leaves it alone), add `giftMessage: string | null` to `Order` in
   `core/order.ts` and to every place that constructs an order (`createOrderForSession`, the in-memory repositories and
   test fixtures; TypeScript points at each).
6. **Write it through the right path.** A plugin write is `container.orders.update` inside `withOrderLock` /
   `applyOrderEvent` (content `update` is last-writer-wins per column).
7. **Tests:** the repository round trip (`content/*repositories.test.ts`), the reconcile of an existing collection without
   the field (`schema/reconcile.test.ts`) and, for anything that touches EmDash's real behaviour, a real-host test
   (`adapters/emdash/real-host/schema-seed.real.test.ts` shows how to seed an old schema and run the reconciler).

**Repeater sub-fields are never `required`.** EmDash validates every draft autosave against the schema, so a required
sub-field fails the autosave (`400 VALIDATION_ERROR`) the moment an editor clicks "Add item". Keep every sub-field optional
and skip incomplete rows when reading (`resolveGallery`, `catalog-mapper.ts`); a repeater accepts scalars only (no
reference), so a line's product id is plain text. `field-names/*` and the repeater definitions
(`GALLERY_SUB_FIELDS`, `ORDER_LINE_SUB_FIELDS`) already follow this; `catalog.real.test.ts` asserts it for the galleries.

### 3.2 Adding a relation

Example: products belong to a collection of `suppliers`.

1. **Declare the relation** next to the collections: a `RelationDefinition` in `buildCatalogRelations` /
   `buildSalesRelations` (slug matching `^[a-z][a-z0-9_]*$`, no hyphens; parent and child collection slugs from the options;
   `parentLabel` / `childLabel`; `maxChildrenPerParent` and `maxParentsPerChild`, `null` = unlimited). The slug goes into
   `CATALOG_RELATION` / `SALES_RELATION`. The two collections are fixed once the relation exists; a self relation is
   allowed (`product_categories`).
2. **Add a field on each end** that should be visible: `relationField(PRODUCT_FIELD.supplier, "Supplier", CATALOG_RELATION.productSupplier,
   RELATION_SIDE.child)` on the many side (selects the parent), the same on the parent side with `RELATION_SIDE.parent`
   and `{ multiple: true }` (lists children). `multiple` only shapes the picker; the limit that is enforced is the
   relation's. A relation field has no column, is never `indexed` and cannot be `required` on an existing collection.
3. **The 50-children rule.** A read through `RelationsPort` returns one page of 50 links and no cursor. A relation the plugin
   must read in full has to be **bounded to 50** (`CATALOG_LIMITS`; the catalog repository throws `CATALOG_LIMIT_EXCEEDED`
   rather than truncate). For an unbounded relation never read children in a service: keep an **indexed scalar** next to it
   (`order_id` on `payments` and `order_events`, mirroring the link, written together with it) and query that.
   Relation fields cannot be filtered either, so "all X of Y" is a parent -> children read or a scalar query.
4. **Read and write only through `container.relations`** (`children`, `fields`, `parentOf`, `setChildren`, `setParent`,
   `createWithReferences`): never `ctx.content`, which refuses relation-bound fields. A write replaces the whole set of the
   field. For a new plugin-owned record that needs links, `createWithReferences` creates both in one write; the writes
   bypass content hooks and draft staging, which is right for plugin-owned records and wrong for a product an editor
   edits. Pass `includeDrafts: true` for the plugin's own checks and `false` for a public read.
5. **Existing databases get it automatically**: the reconciler creates a missing relation and adds the bound fields in one
   `applySeed`. An existing relation is never changed (its two collections cannot move). A site seeding its own content
   must create links through the seed's `relations` (`applySeed`), not by writing the field.
6. **Tests.** `testing/in-memory/relations.ts` is built from `buildSchemaDefinitions`, so the new relation exists in every
   service test; `schema/collections.test.ts` checks every relation against its fields and the limits; add a real-host
   case (`real-host/relations.real.test.ts`, `catalog.real.test.ts`) when behaviour depends on EmDash's edge handling.

### 3.3 Adding a collection

1. Add the slug to `contracts/options.ts` (`collections`, with a default) and its field names to `field-names/`.
2. Add a `CollectionDefinition` to `buildCatalogCollections` or `buildSalesCollections`: `navigation:
   collectionNavigation(ADMIN_NAV_GROUP.…, "<position key>")` (add the key to `NAV_POSITION`), `hidden: true` for a helper
   collection edited from its parent (variants, prices, payments, order events; its list and editor stay routable and
   its entries pickable), `isPluginOwned` for records only the plugin creates, `listColumns` (at most 4) and `titleField`.
3. A collection that is new in a release is created whole (fields, relations, placement, `hidden`). Moving or hiding an
   *existing* collection in a later release only reaches collections that have no folder and no position; an admin's
   placement wins.
4. Map it (`record-mappers.ts` or `catalog-mapper.ts`), add its port and repository (`ports/repositories.ts`, the
   in-memory version in `testing/in-memory/`, the contract suite in `testing/contracts/`), and protect it
   (`schema/protected-fields.ts` derives the policy from the definition).
5. Tests: `collections.test.ts` (slugs, field names, relations, nav, hidden), the repository, a real-host reconcile.

### 3.4 Adding an editor panel or action

1. A Block Kit panel is a private `POST` route: add `ROUTE.editor<Name>` in `contracts/api.ts`, the route in
   `plugin/routes/catalog-editor.ts` (or its own module registered in `plugin/routes/index.ts`) with
   `builder.privateRoute({ methods: ["POST"], permission, schema: editorPanelInteractionSchema, handler })`. The handler
   gets the interaction (`panel_load`, `block_action`, `form_submit`) and returns `{ blocks, toast?, refresh? }`; always
   re-render the current state, so a failed action still shows it next to the error toast. Take the entry from
   `invocation.ctx.ui?.entry` (host-attested), never from the input, and check its collection.
2. Declare it in `plugin/editor/catalog.ts` or `order-timeline.ts` (`PluginEditorPanel` / `PluginEditorAction`), **scoped
   with `collections: [slugs.<x>]`** (otherwise it shows on every collection of the site) and compose it in
   `plugin/editor/index.ts`. Use only the Block Kit subset in `plugin/editor/blocks.ts`; tests validate every rendered
   panel with the host's own validator (`editor/editor.test.ts`).
3. Permission: a panel route has one permission (`content:edit_any`); a stricter check for the mutations runs inside the
   handler against `ctx.user.role` (see the Timeline panel). An action that changes system state is `plugins:manage`.
4. A plugin with a React admin entry loses editor panels and actions, so do not add one for this.

### 3.5 Hooks that need relation data

`content:beforeSave` receives field values only, never relation selections. Anything that depends on links (a variant's
derived key, a price's exactly-one-parent rule, managed prices) runs in `content:afterSave` and writes back with a content
update, which fires no hooks (so it cannot loop). A rule that must **refuse** an action using link data belongs in a
policy hook (`content:beforePublish` / `beforeSchedule`, capability `hooks.content-policy:register`), like the publish guard
in `services/catalog/publish-guard.ts`.

### 3.6 When a data migration, when not

The reconciler handles **structure that is missing**. Use a numbered data migration (`schema/migrations.ts`) only for:
a backfill of rows that predate a field, a renamed stored value, or changing an **existing** field's definition
(`SchemaPort.setFieldValidation`, e.g. the options of a select). Anything else is a definition change and nothing more.
Never edit or reorder a released migration; append at the end. Ids are zero-padded and run in order under a KV lock; a
failure is logged and retried on the next activation or first use (later migrations wait). A migration must be idempotent
and resumable.

```ts
import type { PluginContext } from "emdash";

{
  id: "0003-backfill-gift-message",
  description: "Sets gift_message to an empty string on orders that predate the field.",
  run: async ({ plugin, collections, log }) => {
    const { content } = plugin as PluginContext;
    let cursor: string | undefined;
    do {
      const page = await content!.list(collections.orders, { limit: 100, cursor });
      for (const entry of page.items) {
        if (entry.data.gift_message === undefined) await content!.update!(collections.orders, entry.id, { gift_message: "" });
      }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    log.info("gift_message backfilled");
  },
},
```

`plugin` is typed `unknown` in `MigrationContext` (cast it); `content.update` fires no hooks. Test it with
`runDataMigrations` and the fake plugin context (`schema/migrations.test.ts`). The two migrations that exist
(`0001-baseline`, `0002-optional-option-sub-fields`) are no-ops: the catalog v2 model replaced the data they were about.

## 4. Adding an admin route and an MCP tool

Example: `admin/orders/review-clear`, which clears an order's review flags once a human has looked at it (the plugin
only ever adds flags; nothing clears them today).

1. **Contract** (`contracts/api.ts`): add `adminOrdersReviewClear: "admin/orders/review-clear"` to `ROUTE` and a zod
   schema: `export const adminOrdersReviewClearInput = z.object({ orderId: id });` (`id` is the file's
   `z.string().min(1).max(64)`).
2. **Service** (`services/admin/orders.ts`): a use case on the container. It throws `CommerceError`, validates what
   the schema cannot, and mutates under the order lock:

   ```ts
   export const clearReviewFlags = async (container: CommerceContainer, input: z.infer<typeof adminOrdersReviewClearInput>): Promise<OrderSummary> => {
     const updated = await withLock(container, LOCK_KEY.order(input.orderId), async () => {
       const order = await container.orders.get(input.orderId);
       if (!order) throw new CommerceError("notFound", "Order not found");
       if (order.reviewFlags.length === 0) return order; // idempotent
       return container.orders.update(order.id, { reviewFlags: [] });
     });
     return toOrderSummary(updated);
   };
   ```
   Export it from `services/admin/index.ts`.
3. **Route** (`plugin/routes/admin.ts`): choose the permission, `read` (`content:edit_any`) for looking, `manage`
   (`plugins:manage`) for anything that changes data or moves money:

   ```ts
   [ROUTE.adminOrdersReviewClear]: manage({
     schema: adminOrdersReviewClearInput,
     handler: ({ container, input }) => clearReviewFlags(container, input),
   }),
   ```
   The handler receives `{ ctx, container, input, cartId }`; `ctx.user` is the caller (see `caller(ctx)`). Rate limiting
   is optional (`rateLimit` in the spec). The output is returned as `{ data }`.
4. **MCP** (`plugin/mcp.ts`): add an entry to `MCP_TOOLS`: `commerce_orders_review_clear: { route:
   ROUTE.adminOrdersReviewClear, description, input: adminOrdersReviewClearInput }` (add `destructive: true` when the
   call is hard to undo). EmDash requires a tool's route to be private, POST, JSON and permission-carrying; the
   permission is the route's. Write the description for an agent: what it does, what it costs, whether it moves
   money, how to repeat it safely.
5. **Tests:** `plugin/routes/admin.routes.test.ts` shows how a route is exercised with the fake plugin context; add a
   permission assertion (the route's `permission` equals `plugins:manage`) and the service test. `plugin/mcp.test.ts`
   covers the MCP list.
6. **Docs:** a row in `docs/api.md` and in the README's tool table.

## 5. Rules that must not be broken

- **Stripe types never leave `adapters/stripe`.** No `import "stripe"` anywhere else. Services see
  `PaymentProvider` and the `Provider*` shapes; a new Stripe concept is a new port member plus an adapter
  implementation, not an SDK call in a service. Wrap SDK calls in `callStripe` / `retrieveStripe` so they surface as
  `ProviderError`.
- **Idempotency keys come from record ids and versions, never random.** `stripe-commerce:<op>:<recordId>[:v<syncVersion>][:<hash>]`.
  A key must not be reused for a different payload (Stripe rejects it), and **Stripe replays a key's response for 24 h**:
  anything that can repeat an identical payload for a later intent (archive, reactivate, archive again) needs a
  version in the key (`services/catalog/idempotency.ts`).
- **Money is integer minor units**, with a currency, converted only in `core/money.ts`. No floats.
- **`CommerceError` at the boundary.** Services throw `CommerceError` (stable code) or `ProviderError`; only
  `plugin/http.ts` turns them into `PluginRouteError`. **Never return an error object from a route handler**: EmDash
  answers HTTP 200 for it. Messages that reach a client carry no secrets, stack traces or provider internals.
- **Never write `products` content.** A collection with revisions stages plugin writes into a draft, so the live row
  would never see them. Anything the plugin must remember about a product goes to `catalog_links` (plugin storage).
  The plugin writes only variants, prices and its own collections; the one deliberate exception is the Specification
  panel, which saves the `specs` snapshot of a product on an editor's explicit save (`services/catalog/specs.ts`, a plain
  content update, so it lands like any editor edit).
- **Order and payment changes go through the lock.** Content updates are last-writer-wins: use `applyOrderEvent` /
  `withOrderLock` / `withLock`, re-read inside, and derive totals from the provider's cumulative figures, never from
  deltas. New statuses go through `transitionOrder`.
- **Exactly-once means a claim.** Creation of a record from an event: `claimOrAwait` on a `RECORD_INDEX_KEY`, create,
  `recordIndex.set`, release the claim on failure. Follow-up steps must be safe to run twice.
- **Handlers are idempotent and deterministic.** Event ids are `${type}:${sourceId}`; no `Date.now()` or randomness in
  ids that must survive a replay.
- **The server decides amounts.** Never trust a price, total or currency from a client, a cart line or event metadata;
  metadata carries ids only (`emdash_cart_id`, `emdash_checkout_id`).
- **Time and randomness are injected** (`container.clock`, `container.ids`) so tests are deterministic.
- **Route inputs come from the query string for GET/DELETE** and from the JSON body for POST: design schemas
  accordingly.
- **Hooks never throw for follow-up work** (`content:after*` run after the response; errors are only logged). The
  durable path is the `catalog_links` row plus cron retry.
- **Secrets never reach logs or errors.** The adapter redacts key-shaped strings; keep it that way.
- **Files stay under 600 lines**; split into a folder. Arrow functions, `interface` for shapes, `as const`
  vocabularies, positive booleans (`isX`, `hasX`, `canX`), guard clauses first.
- **Every behaviour ships with a test**, and critical guards (settlement exactly-once, refund bounds, stock guard,
  signature check, token verification, CAS retries, state transitions) get a mutation check.
