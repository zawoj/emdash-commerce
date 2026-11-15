---
name: emdash-plugin-stripe-draft-staging
description: never write the products collection from the plugin — a collection with revisions stages the write as a draft; Stripe ids live in plugin storage catalog_links and on variants/prices only
---

# EmDash Stripe plugin — never write `products` content

A published product with a **staged draft** keeps its live data in the row's columns. A plugin write (`content.update`)
to such an entry lands in the **draft revision** when `draftRevisionId` is set, so the live row never sees it. The
prototype hit this by writing `stripe_product_id` onto products.

Current design (0.2): `products` is the only collection with drafts and revisions, and the plugin **never writes it**.
The Stripe mapping and sync state of products, variants and prices live in plugin storage `catalog_links`
(`entity key` `product:<id>` / `variant:<id>` / `price:<id>` → provider id, price per terms fingerprint, sync version,
last written payload). Variants and prices have no drafts (`supports: []`), so they carry display-only `stripe_*` mirror
fields written by `catalogMirror`. Cart pricing reads **live** content through `content.get`/`list` (published
columns), so an unpublished edit never reaches a cart or Stripe.

The protected-field guard reads draft revisions too (`content:revisions:read`), because an editor's form re-submits
unchanged read-only fields. See `packages/plugin-stripe/docs/architecture.md` and
[[emdash-plugin-stripe-extending]]; keys that must follow sync versions: [[emdash-plugin-stripe-idempotency]].
