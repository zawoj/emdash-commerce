---
name: emdash-plugin-stripe-extending
description: where things live in packages/plugin-stripe (0.2 rewrite + catalog v2: relations, product types, three-axis orders), the extension seams, the invariants to keep and the EmDash/Stripe traps learned — read before changing or extending the plugin
---

# Extending the EmDash Stripe plugin: map, seams, invariants, traps

Docs describe the code: `packages/plugin-stripe/README.md`, `docs/architecture.md`, `docs/api.md`,
`docs/extending.md` (worked examples). Decisions: `.ai/decisions/2026-11-12-emdash-stripe-commerce-architecture.md`
and `.ai/decisions/2026-11-13-emdash-commerce-catalog-relations-and-orders.md` (relations, product types, orders).
This note is the short version for an agent about to edit. Verified against the code 2026-11-13.

## Where things are (`packages/plugin-stripe/src`)

- `core/` pure domain (money, cart pricing, `transitionOrder`, events, errors) → `ports/` interfaces →
  `services/` use cases → `adapters/emdash` (content + plugin storage, schema, settings) and `adapters/stripe` (the
  only `stripe` importer) → `plugin/` (routes, hooks, cron, MCP, admin page, `container.ts` = composition root).
  `contracts/` = options, HTTP schemas, extension API. `testing/` = in-memory ports, fake provider, fixtures.
- Schema is data, in `adapters/emdash/schema/`: `collections/{catalog,sales,shared,index}.ts` (collection, relation and
  field definitions; `relationField`, `RelationDefinition`, `hidden`, `NAV_POSITION`), `field-names/{catalog,sales}.ts`
  (slugs, `CATALOG_RELATION`, `SALES_RELATION`, `CATALOG_LIMITS`), `reconcile.ts` + `registry-port.ts` (additive reconciler
  over `applySeed`), `protected-fields.ts` + `guard.ts`, `migrations.ts`. Links between collections are read and written
  only through `adapters/emdash/relations/port.ts` (`RelationsPort`; EmDash impl `emdash-relations.ts`, in-memory
  `testing/in-memory/relations.ts`).
- Catalog model: pure rules in `core/{catalog-rules,product-type,catalog,price-selection}.ts`; services in
  `services/catalog/` (`derive-variant`, `variant-generator`, `specs`, `managed-prices`, `price-links`, `publish-guard`,
  `save-checks`, sync) and the public reads in `services/catalog-read.ts` + `services/storefront/*`; images through
  `adapters/emdash/content/media.ts`.
- Orders: `core/{order,order-state,order-lifecycle,order-timeline,order-number}.ts`; payment axis `transitionOrder`, lifecycle
  and fulfillment `services/admin/order-actions.ts`, timeline `services/order-events.ts` (`recordOrderEvent` is the only writer).
- Editor panels and actions (Block Kit, per collection): `plugin/editor/*` + `plugin/routes/catalog-editor.ts`, declared in
  `plugin/admin.ts`.
- Services take a `CommerceContainer`; tests build one over `createInMemoryWorld()` + `createFakePaymentProvider()`
  (`services/payments/test-support.ts`: `createHarness`, `seedCheckout`, `paidOrder`, `h.deliver(event(...))`).
- Dependency rule is by convention, not enforced: a few services import `adapters/*` (see `docs/architecture.md`).

## Extension seams (pick the smallest)

- Site, no fork: `defineCommerceExtensions` through a site-owned entrypoint calling
  `createStripeCommercePlugin(options, extensions)` — subscribers, `validateCart`, `customizeCheckout`,
  `generateOrderNumber`, `emails`, `stripeWebhooks`. Descriptor `options` are JSON only.
- New Stripe event: `WEBHOOK_EVENT_TYPES` → `WebhookAction` variant (`ports/payment-provider.ts`) → mapper +
  `toWebhookAction` → handler returning `HANDLED`/`ignored()` → `dispatchAction` (no `default`, TS forces it) →
  optional domain event in `core/events.ts` → fixture in `testing/fixtures/stripe/events/` + `provenance.json` + test.
  Existing sites must press "Register webhook" again (`events_outdated`).
- New field: `field-names/*` → `collections/*` (additive; the reconciler adds it on next start, never required on an
  existing collection) → mapper in `record-mappers.ts` / `catalog-mapper.ts` → type in `core/`.
- New relation: `RelationDefinition` in `buildCatalogRelations` / `buildSalesRelations` + a `relationField` on each end;
  bound to 50 children if read in full, else keep an indexed scalar id and query that. New collection: option slug →
  definition (`hidden` for a helper edited from its parent) → repository port + in-memory + contract suite.
- New editor panel / action: `ROUTE.editor*` + private POST route + declaration in `plugin/editor/*` **scoped with
  `collections`**; a rule that needs relation data runs in `content:afterSave`, a refusing one in a policy hook
  (`beforePublish`). Backfill or changing an existing field = new numbered entry in `DATA_MIGRATIONS`, never edit a
  released one.
- New admin operation: `ROUTE` + zod schema in `contracts/api.ts` → service in `services/admin/` → route in
  `plugin/routes/admin.ts` (`read` = `content:edit_any`, `manage` = `plugins:manage`) → entry in `MCP_TOOLS`.

## Invariants

- No `stripe` import outside `adapters/stripe`; provider failures are `ProviderError`, domain failures `CommerceError`;
  only `plugin/http.ts` converts them to `PluginRouteError`.
- Money in integer minor units (`core/money.ts`). The server decides amounts; metadata carries ids only.
- Idempotency keys: from record ids and versions, never random (`stripe-commerce:<op>:<id>[:v<n>][:<hash>]`).
- Never write `products` content on the plugin's own initiative (the Specification panel's `specs` save on an editor's
  explicit save is the one exception). Order/payment/customer/subscription changes go through `withLock` /
  `applyOrderEvent` (payment axis) or `performOrderAction` / `setFulfillment` (lifecycle, fulfillment), all under the order
  lock; refunded totals come from Stripe's cumulative figure, not deltas.
- Links between collections only through `container.relations`; never `ctx.content` for a relation-bound field.
- Exactly-once = a `recordIndex` claim (`claimOrAwait`); follow-up steps idempotent and repeated on retry.
- Event ids are deterministic (`${type}:${sourceId}`); subscribers idempotent on `event.id` (at-least-once).
- Time and randomness from `container.clock` / `container.ids`. Files < 600 lines.

## Traps learned (all cost real time)

- **Collections with revisions stage plugin writes as drafts**, so a write to `products` never reaches the live row.
  Stripe ids live in plugin storage `catalog_links`; only variants and prices (no drafts) carry `stripe_*` mirror fields.
- **Stripe caches an idempotency key's response for 24 h.** An identical payload for a later intent (archive,
  reactivate, archive again) with the same key silently replays the old result. Update/archive keys carry the link's
  `syncVersion` (`markPending` bumps it); create keys carry the terms fingerprint.
- **Content `update` is last-writer-wins** per column, and `update`/`delete` fire no hooks. Order transitions
  therefore run under the order lock and re-read inside it.
- **EmDash answers HTTP 200 for a returned error object.** Throw `PluginRouteError` (via `CommerceError`).
- **GET and DELETE route input comes from the query string**, POST from the JSON body (`DELETE cart/lines?priceId=`).
- **`applySeed(..., "skip")` never adds a field** to an existing collection, and `"update"` rewrites the collection row from
  the seed (an omitted `supports` resets to none): the reconciler (v2, over `applySeed`) builds a seed that carries the
  stored label/`supports`/placement plus only the missing fields, relations and collections (there is no plugin upgrade
  hook). It never alters or deletes, and added fields on an existing collection are never required.
- **`events.list` accepts at most 20 `types`**: reconciliation slices the 34 handled types.
- **API `2026-10-28.endive`:** Checkout `ui_mode` is `hosted_page` / `embedded_page` (`success_url`/`cancel_url` hosted,
  `return_url` embedded); `customer_creation`, `shipping_options` and `payment_intent_data` are payment-mode only
  (`subscription_data` subscription-only; subscription mode always creates the Customer); `payment_method_types` is
  rejected; `expires_at` must be 30 min to 24 h; subscription periods live on items; invoice event snapshots lack
  payment links, so `retrieveInvoice` is the way to the PaymentIntent.
- **Plugin routes cannot set cookies** (header allowlist): the storefront stores the cart id and sends
  `x-commerce-cart`; the `emdash_commerce_cart` cookie is only a fallback read.
- **Unindexed filters throw:** `fieldFilters`, `where` and `orderBy` need declared indexes (storage:
  `adapters/emdash/storage/declaration.ts`; content: `indexed: true` on the field).
- **Routable collections need a slug to publish**; plugin-owned collections are `routable: false`, and `slug` in create
  data is rejected as an unknown field. Reserved field slugs (`status`, `created_at`, ...) force `order_status` etc.
- **Native relations (EmDash 1.5):** `SchemaRegistry.createField` with a relation does not wire it; only `applySeed`
  (`seed.relations` + fields with `validation.relation` + `relationSide`) writes the relation. Relation-bound fields have no
  column: `ctx.content.create/update` refuse them, `get/list` never return them, `fieldFilters` cannot filter them. Edges
  are written/read through the exported `handleContentCreate/Update/Get(db, …, { references })` (whole set per field, ordered,
  immediate, no hooks, no draft staging); a read is one page of 50 with no cursor, live reads hide unpublished children.
  Relation slugs match `^[a-z][a-z0-9_]*$` (no hyphens), the two collections are fixed once created, a self relation works.
  A scalar `reference` WITHOUT `targetCollection` stays column-backed (text id) — the plugin no longer uses those for catalog
  or order links.
- **`content:beforeSave` sees field values, never relation selections.** Derived variant fields, the price exactly-one-parent
  rule and managed prices therefore run in `content:afterSave`; refusing a publish uses `content:beforePublish` /
  `beforeSchedule` (needs `hooks.content-policy:register`). A hook that writes back with `content.update` cannot loop (no hooks).
- **`hidden: true` only removes a collection from the sidebar, dashboard and command palette**; its list, editor and
  pickers still work. It is applied at creation and, for an existing collection, only while it has no sidebar placement.
- **Editor panels/actions exist only for a plugin without a React admin entry**, and a panel route has one permission (a stricter
  per-mutation check lives in the handler). Without `collections` a panel shows on every collection of the site.
- **`options_key` uniqueness is a hook check** (EmDash has no compound unique index on content): racy under concurrent saves of
  one product. Orders of a customer, payments of an order etc. cannot be filtered or read past 50 through the relation: keep
  an indexed scalar next to it (`order_id`).
- **The 0.2 `order_status` field held the payment status; since catalog v2 it is the lifecycle** (`payment_status` is the
  payment axis). `ORDER_STATUS` is only a deprecated alias of `ORDER_PAYMENT_STATUS`. Never read `order_status` as payment state.
- **`updateIf` does not clamp:** the guard must be at least as strict as the delta (stock `available >= qty`).
- **`content:after*` hooks run after the response and errors are only logged:** the durable path is the `catalog_links`
  row plus the cron retry, never the hook alone.
- **Settlement must never drop a paid order:** a mismatch becomes a review flag; a late async payment whose hold
  expired decrements stock once and flags `inventory_shortfall`.
- **A webhook that throws on an unmappable event retries identically for days:** unmappable objects become
  `unsupported` (kept, ignored).
- **`content:afterSave` gets the whole entry, `beforeSave` gets the fields.** afterSave's `event.content` is
  `{ id, type, slug, status, data }` (emdash `contentItemToRecord`), so field values are under `data`; beforeSave
  receives the field record itself. A test that passes flat content to an afterSave handler proves nothing.
- **Refunds and disputes can arrive before settlement recorded the order** (test card 0259 sends
  `charge.dispute.created` in the same second as `checkout.session.completed`). "No order yet" for a
  PaymentIntent with our metadata means retry (`SettlementPendingError`), never `ignored`.
- **A deleted collection's slug can report `COLLECTION_EXISTS` for a moment**, and the schema marker in KV stops
  the reconciler from looking again once written: the port re-reads the collection before treating "exists" as
  success. After deleting a plugin collection by hand, delete `plugin:stripe-commerce:state:schema-marker` too.
- **Never mark a repeater sub-field `required`:** EmDash validates every draft autosave against the schema, so a
  required sub-field fails the autosave the moment an editor clicks "Add item" (400 `VALIDATION_ERROR`). Keep
  sub-fields optional and skip incomplete rows when reading (`resolveGallery`, `catalog-mapper.ts`); the real-host test asserts
  it for the gallery repeaters only, no test covers every definition. A repeater takes scalars only (no reference). Changing
  an existing field's definition is a data migration (`setFieldValidation`), never the reconciler.
- **Sidebar placement (EmDash 1.5):** a collection's `group` makes a folder under Content (Catalog, Sales); a plugin admin
  page joins that folder only if its `group` equals a collection's group (otherwise it folds into the Plugins section). Any
  `sortOrder` puts a collection *before* every collection without one, so the commerce folders sit above the blog's
  collections; the plugin uses 1000+ so a site numbering its own collections from 1 stays on top. The admin's
  "Customize sidebar" (`/settings/sidebars`) can still reorder per site.
- **Astro 7 `astro dev` detaches** (daemon with a pid; stop with `npx astro dev stop` in `apps/storefront`), so
  `pnpm dev` through Nx reports "failed" although the server is running.
- **Dev env:** `apps/storefront` must start through `node --env-file-if-exists=.env` for `STRIPE_*` to reach `process.env`;
  saving secrets needs `EMDASH_ENCRYPTION_KEY`.
- **A media-library `image` value has no `src`.** EmDash stores `{ provider: "local", id, filename, mimeType, width, height,
  meta: { storageKey } }` and derives the URL at render time (`media/normalize.ts`: "strip `src`"); a value with `src` is
  stored as `external`. The public URL is `/_emdash/api/media/file/<meta.storageKey ?? id>` (emdash `media/url.ts`,
  `local-runtime.ts` `getEmbed`); other providers need their provider module, so the plugin only trusts a `src`/`url` on them.
  Every storefront image goes through `adapters/emdash/content/media.ts` (`resolveMediaImage`, `resolveGallery`); never read
  `.src` by hand. Repeater sub-fields of type `image` are normalised on save too.
- **Trash fires `beforeDelete` + `afterDelete` (`permanent: false`), but afterwards nothing hanging off the entry is readable:**
  `getVariant`/`getPrice` return null, `relations.children(...)` throws `Content item not found`, a trashed product's
  variants cannot be listed. So `content:beforeDelete` marks the dependents' links pending (`prepareDelete`) while they can
  still be listed, and afterDelete + cron settle every due link by link (`settleMissing` -> `archiveDeletedEntity`). A silent
  `return` for a missing entity in `attemptEntity` leaves the link `pending`, due since 1970, forever (and eats cron's limit);
  `archiveDeletedEntity` must never seed a link (`loadLink` creates a pending ghost) and must settle one without a provider id.
- **A variant's managed price follows `is_active`:** inactive variant = no managed amount = the entry is archived and
  restored on reactivation (`managedAmountOfVariant`); the entry of a trashed variant is deactivated through
  `catalogMirror.writePriceActive`.
- **Galleries are scalar repeaters** (`gallery` on products and variants: `image` + `alt`, never required). Storefront order:
  product image, product gallery, then each variant's image and gallery, de-duplicated by URL; Stripe still gets the product
  `image` only (relative URLs are dropped there anyway).

Related: [[emdash-plugin-stripe-idempotency]], [[emdash-plugin-stripe-draft-staging]],
[[emdash-plugin-stripe-webhook-traps]], [[emdash-plugin-stripe-cookies]], [[emdash-plugin-stripe-admin-carts]].
