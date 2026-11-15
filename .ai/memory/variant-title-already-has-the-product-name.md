---
name: variant-title-already-has-the-product-name
description: A variant title is derived as "<product> — <options>" - never prefix the product title again; use variantDisplayNameOf / variantOptionsLabelOf
---

# A variant title already carries the product title

`variantTitleOf` (`core/catalog-rules.ts`) stores `Shirt — M / Black` in the variant's `title`. Code that composed
`${product.title} — ${variant.title}` (Stripe Product name in `sync-variant.ts`, the cart line, emails, low-stock list,
subscription items) therefore produced "Shirt — Shirt — M / Black" on Stripe Checkout and in the cart.

- Compose names only with `variantDisplayNameOf(productTitle, variantTitle)`; show the option part alone with
  `variantOptionsLabelOf`. Both accept a hand-typed title that lacks the prefix.
- The order line snapshot keeps `title` and `variantTitle` as they were; display code applies the helpers.
- Existing Stripe Products keep the old name until the catalog is resynced (Commerce page or `commerce_catalog_resync`).
