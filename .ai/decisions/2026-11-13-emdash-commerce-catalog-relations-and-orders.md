# EmDash commerce: product types, native relations and three-axis orders

Date: 2026-11-13 · Task: none (scope agreed in the session) · Extends
`2026-11-12-emdash-stripe-commerce-architecture.md` (layers, Stripe as mirror, settlement, inbox/outbox stay).

## Context

The 0.2 data model of `packages/plugin-stripe` works end to end, but editors meet raw data:

- Cross-collection links (variant → product, price → product, payment → order, …) are `reference` fields
  without a relation. EmDash 1.5 renders them as a plain text input holding an entry id ("Holds an entry
  ID…"), verified in the admin.
- Product options are a free-text repeater (`Size` / `S, M, L`), variant option values another one; nothing
  ties a variant to the product's options, and a required repeater sub-field broke draft autosave.
- Orders carry one status that mixes payment and lifecycle, line items are a JSON blob, numbers are random.

A previous Payload-based shop of the same author models the same domain well: product types with variant axes and
spec attributes over a dictionary of attributes and values, variants as exactly one value per axis
(`optionsKey`), price on the product with a variant override, categories (tree) and brands, helper
collections hidden from the menu and shown inside their parent (Payload join fields), and orders with
snapshotted lines, three status axes, an event timeline and gap-free numbers. That shop is single-currency
and has its own promotion, tax and shipping engines; we keep Stripe for those (promotion codes, Stripe Tax,
shipping rates) and keep the multi-price, multi-currency, recurring `prices` collection.

EmDash 1.5 facts this decision rests on (verified in source and with real-SQLite spikes):

- Relations (`_emdash_relations` + edges in `_emdash_content_references`, keyed by translation group) are
  created by `applySeed` (`seed.relations`, fields with `validation.relation` + `relationSide`).
  `SchemaRegistry.createField` with a relation does not wire it (edges never written). A self relation
  (`parentCollection === childCollection`) works, so a category tree is one collection.
- `applySeed(..., { onConflict: "skip" })` adds nothing to an existing collection; `"update"` adds missing
  fields, relation-bound ones included.
- Relation-bound fields are storage-less: `ctx.content.create/update` cannot write them (refused for
  relation-bound fields in `data`) and `ctx.content.get/list` never return them; `fieldFilters` cannot
  filter on them. The exported handlers `handleContentCreate/Update(db, …, { references })` write edges
  (ordered, whole set per field, immediate even on revision collections) and `handleContentGet(db, …,
  { includeDrafts })` reads `item.references[field].children`. Live reads hide unpublished children.
- The admin renders both relation sides as an ordered list with a search picker (reorder on the parent
  side), with no inline create. `hidden: true` removes a collection from the sidebar, dashboard and command
  palette only; its list and editor stay routable and its entries stay pickable.
- Repeater sub-fields are scalar only (no reference); there are no conditional fields, tabs or field
  groups, and no compound unique constraint on content collections.
- A native plugin without a React admin entry (ours: Block Kit) gets `admin.editorPanels` and
  `admin.editorActions` per collection (private POST routes; an action returns `{toast, refresh}`).

## Decision

1. **Catalog vocabulary as content.** New collections `attributes` (name, storefront label, input type,
   presentation, unit, code, filterable), `attribute_values` (label, code, swatch; ordered as the parent
   attribute's children), `product_types` (name, code, variant axes ≤ 3 select attributes, allowed values,
   spec attributes, required specs), `brands` and `product_categories` (a self-related tree, routable, with
   image/intro/description). Products get a type, a brand and categories; the free-text option repeaters
   are removed. A variant is exactly one allowed value per axis; `options_key` (sorted value ids) is unique
   per product, enforced in `content:beforeSave`; SKU and title are derived when empty. Publishing a product
   is refused when a required spec, the SKU of a simple product or an active variant is missing.
2. **All cross-collection links are native relations**, declared next to the collections in the plugin's
   definitions and created through `applySeed`. The plugin reads and writes edges only through one port
   (`RelationsPort`) implemented over the exported handlers; repositories stop storing scalar link ids.
   Queries that used `fieldFilters` on a link read the parent's children instead.
3. **Helper collections are hidden and live in their parent**: variants and prices in the product,
   attribute values in the attribute, payments and order events in the order. The sidebar keeps Catalog
   (Products, Product types, Attributes, Brands, Categories) and Sales (Orders, Customers, Subscriptions,
   Commerce page).
4. **Editor tools are Block Kit editor panels and actions**: on products a Variants panel (generate the
   ticked combinations, capped, skipping existing `options_key`s) and a Specification panel (one control per
   spec attribute of the type, values stored as a JSON snapshot); on orders a Timeline panel.
5. **Hybrid prices.** Products carry a base `price` (minor units, the store's default currency) and
   variants an optional override. The plugin keeps one managed entry in `prices` per sellable (`is_managed`,
   protected, never edited by hand) mirroring that amount, so cart, checkout and catalog sync keep a single
   price model. Extra prices (subscriptions, other currencies) are ordinary `prices` entries.
6. **Orders: three axes and a timeline.** `order_status` (open, completed, cancelled, archived),
   `payment_status` (today's provider-driven state machine) and `fulfillment_status` (unfulfilled,
   partially fulfilled, fulfilled, partially returned, returned). Lines become a scalar repeater snapshot
   (title, variant title, SKU, option labels, quantity, unit amount, discount, tax, total, product/variant
   ids as text). Every state change appends to a hidden `order_events` collection related to the order.
   Order numbers are sequential per year from a KV counter (`compareAndSet`), format configurable, the
   `generateOrderNumber` extension still overrides.
7. **Schema evolution** moves to `applySeed`: new collections, relations and fields go through a seed built
   from the definitions (`onConflict: "update"` scoped to the plugin's own collections and only to missing
   fields); changing an existing field stays a numbered data migration. The 0.2 local data is wiped and the
   demo catalog re-seeded (the plugin is unreleased).

## Alternatives considered

- **Keep scalar link ids and show children in Block Kit panels.** Plugin-writable and filterable, but every
  link stays a raw id input for editors; rejected, it is the defect we are fixing.
- **Categories as an EmDash taxonomy.** Native picker and tree, but terms hold only a label and description
  (no image, intro, SEO, routable page); rejected for a shop.
- **Price only on product/variant (the earlier shop's model).** Simplest, but drops subscriptions and multi-currency, which the
  Stripe model supports; kept as the default path inside the hybrid instead.
- **Copy the earlier shop's promotion, tax and shipping engines.** Duplicates what Stripe Checkout already provides.
- **A React admin entry for richer editors.** EmDash disables Block Kit editor panels and actions for a plugin
  with a React entry, and the Commerce page is Block Kit; deferred.

## Consequences

- Catalog and order repositories change their link handling; tests need an in-memory `RelationsPort` and
  the real-SQLite layer proves it against `applySeed` and the handlers.
- Writes through the handlers bypass content hooks and draft staging, so the plugin uses them only for edges
  and for plugin-owned records; editor edits keep going through the admin.
- Relation fields cannot be filtered: "orders of a customer" and similar reads go parent → children (paged).
- No compound unique index: `options_key` uniqueness is a hook check, racy under concurrent saves of the
  same product (acceptable for editor-driven data).
