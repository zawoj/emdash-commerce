# EmDash commerce catalog v2 (multi-agent run): relations, product types, three-axis orders, shop storefront

Agent: Claude Code (lead on Opus; phase agents on Sonnet) · Branch/PR: main / none · Task: none (scope agreed in the session)

## Goal

Make the catalog and order model of `packages/plugin-stripe` something an editor can work with, and put a real
storefront on it. Editors met raw data: cross-collection links were plain id inputs, product options were free text,
orders had one mixed status, line items were a JSON blob and numbers were random. The target is the model described in
`.ai/decisions/2026-11-13-emdash-commerce-catalog-relations-and-orders.md` (modelled on an earlier Payload-based shop, with
Stripe kept for promotions, tax and shipping): native EmDash relations for every link, attributes and product types with
variant axes, brands and a category tree, hybrid prices, publish guard and editor panels, orders with three status axes, a
lines snapshot, a timeline and sequential numbers; then reset the local data, seed a demo catalog and port the
storefront onto the new read API.

## Steps

1. **Phase A (plugin foundation).** Native relations: `RelationDefinition` and `relationField`, `RelationsPort` over EmDash's
   exported content handlers with an in-memory twin and a shared contract suite, schema reconciler v2 over `applySeed`
   (missing relations, collections and fields only; `hidden` collections; sidebar folders Catalog and Sales), real-host tests
   on an in-memory SQLite EmDash. Catalog and order repositories moved from scalar link ids to relations.
2. **Phase B1 (catalog model).** Attributes and values, product types, brands, categories, products and variants on the new
   model; derived `options_key`, title and SKU; the Variants generator and Specification panels; the publish guard
   (`content:beforePublish` / `beforeSchedule`); the "Sync to Stripe" action.
3. **Phase B3 (hybrid prices and storefront API).** Managed `prices` entries per sellable, the lock against editing them,
   `selectDefaultPrice`, `catalog/products` and the new `catalog/product`; the 0.2 shape kept as `catalog/product-legacy`.
4. **Phase B2 (orders).** Three axes (`order_status` lifecycle, `payment_status`, `fulfillment_status` with five values), the
   `lines` repeater snapshot (`line_items` removed), the hidden `order_events` timeline and the Timeline panel, admin actions
   (`complete`, `cancel`, `archive`, `reopen`), notes, sequential numbering with `orders.numberFormat`, `ORDER_STATUS` renamed
   `ORDER_PAYMENT_STATUS` (deprecated alias kept), `Order.status` removed, new domain events, three MCP tools.
5. **Phase C (data reset and demo seed).** Local `data.db` wiped (the plugin is unreleased, no data migration) and a demo
   catalog loaded with `scripts/seed-demo.mjs` (`pnpm seed`) (attributes, types, brands, categories, products with variants and prices).
6. **Phase D1 (design system port).** `packages/design-system` (`@emdash-commerce/design-system`): a volt sportswear design system
   ported from an earlier shop and de-branded (logo and brand-mark assets removed, a `SiteWordmark` rendered from
   props instead), props-driven Astro components and tokens only, no app logic.
7. **Phases D2, D3, D4 (storefront views in `apps/storefront`).** Ported from the earlier shop onto the new API: home, all products
   (archive with controls), product page (axes, gallery, buy box), mini-cart, and the shop-the-look kit checkout (a dialog that
   steps through the products of a look and adds them to the cart together).
8. **Plugin fixes found while wiring the storefront.** Media-library images (no `src`) resolved to
   `/_emdash/api/media/file/<storageKey|id>` with a `gallery` repeater on products and variants; trashing a variant or product
   archives its Stripe objects and settles their links (`content:beforeDelete`, `prepareDelete`, `archiveDeleted`); an inactive
   variant archives its managed price and reactivating restores it.
9. **Docs and memory (this step).** README, `docs/architecture.md`, `docs/api.md`, `docs/extending.md`, the package changelog,
   `.ai/memory/emdash-plugin-stripe-extending.md` rewritten against the code.

## Verification

- `pnpm exec vitest run` in `packages/plugin-stripe`: 81 test files, 1248 tests, all passing (2026-11-13), including the
  real-host tests (`adapters/emdash/real-host/*.real.test.ts`) that run the reconciler, relations, stores and repositories
  against a real in-memory SQLite EmDash.
- `pnpm check:ai` (layout, names, memory index): green after this step.
- Docs were checked against the code (zod schemas in `contracts/api.ts`, route modules, collection definitions, options schema,
  MCP table); statements the code does not support were removed.
- **Live E2E (2026-11-13, Stripe sandbox, `apps/storefront` dev server, Playwright on the storefront, `stripe listen` forwarding):**
  - PASS PDP purchase: Aero Run Tee M / White x2 through the PDP, mini-cart and Stripe Checkout (4242) gave `ORD-2026-00001`: payment `paid`,
    order `open`, fulfillment `unfulfilled`, `lines` snapshot (title, variant, SKU, "Size: M, Colour: White", qty 2, 12900 / 25800), payment and
    customer related, timeline `placed` + `payment_status_changed` (+ `email_sent`). Stock after the sale was 24; the before-value was not captured
    for this order, the decrement itself is proven on the kit order (-1 on each of the 4 sellables, before/after diff of `inventory_levels`).
  - PASS shop-the-look kit: four products, one order `ORD-2026-00002` with 4 lines; the visitor's main cart (Run Cap x1, same cart id) untouched.
    Only reachable by dispatching `variant:change` on the panels of the two products without variants (see bug 1).
  - PASS subscription: `ORD-2026-00003` (mode `subscription`, total 0) and a subscription `trialing`, Stripe trial 7.0 days.
  - PASS admin actions on order 1: `complete` before fulfillment is 409; fulfillment `fulfilled` (repeat changes nothing), `complete` gives
    `completed` (repeat is 409); the timeline holds one entry per change.
  - PASS partial refund on order 2: 50.00 PLN, same `requestId` twice gave one Stripe refund, over-refund is 409 `REFUND_NOT_ALLOWED`
    (`refundable` 35600), `partially_refunded`, timeline `refund_created`.
  - PASS webhook replay: `stripe events resend` of order 1's `checkout.session.completed` answered 200; order, payment, customer and timeline
    counts unchanged.
  - PASS catalog: base price of `aero-run-tee` 12900 -> 13500 and published: the 13 non-overridden variants moved to 13500 (2 Volt overrides stayed
    13900), 13 new Stripe prices active, the 13 old ones archived; restored to 12900 afterwards.
  - PASS editor UI: the product editor shows the Variants and Specification panels and no Options; the sidebar has Catalog (Products, Product types,
    Attributes, Brands, Categories) and Sales (Orders, Customers, Subscriptions, Commerce); the order editor's Timeline panel lists the events.
  - PASS numbering: `ORD-2026-00001` .. `00003` without gaps.
  - Bugs: (1) storefront, not fixed: in the kit dialog a product without variants (Run Cap, Run Socks) never records a pick, so "Next" stays
    disabled (`packages/design-system/src/utils/look-dialog.ts`: `refresh` records a pick only for the current step and `onNext` does not
    refresh the next product); (2) storefront, not fixed: the mini-cart line link points to `/shop/<product id>` instead of the slug, and the
    first render of the mini-cart footer can link `/checkout` (404) before the fragment arrives; (3) plugin, fixed with a test: a subscription
    created by `customer.subscription.created` before settlement kept `customerId` null (a trial sends no later event); `linkInitialOrder` now
    also links the order's customer (`services/subscriptions.ts`, `services/payments/settlement-steps.ts`). Not yet confirmed live: the running dev
    server had not reloaded the plugin, and subscription of order 3 still has no customer relation.

## Outcome

The plugin, its docs and tests are green and the live E2E above passed, with the storefront bugs listed there left open.

## Follow-ups

- Fix the storefront bugs 1 and 2 above; restart the dev server and confirm the subscription customer link live.
- The Portable Text `product` block (`./astro`) still reads the deprecated `catalog/product-legacy`; move it to
  `catalog/product` and drop the legacy route and the deprecated `ORDER_STATUS` / `OrderStatus` aliases in the next release.
- `options_key` uniqueness is a hook check and can race under concurrent saves of one product; relation reads stop at 50, so
  products with more than 50 variants or prices are refused (`CATALOG_LIMIT_EXCEEDED`).
- The Specification panel saves `specs` with a plain content update on a collection with revisions; confirm in a live site how
  that lands next to a staged draft (not covered by a real-host test).
- Per-line fulfilment and refunds, and a React admin entry (which would disable the Block Kit editor panels), are not built.
