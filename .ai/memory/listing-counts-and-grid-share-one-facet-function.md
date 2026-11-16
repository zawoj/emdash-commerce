---
name: listing-counts-and-grid-share-one-facet-function
description: the shop filters count options with features/catalog/domain/facets.ts on the server and in the browser; the plugin API takes one brand and no sizes, so /shop fetches the whole catalog and filters in the page
---

# One facet function for the grid and every count

`GET catalog/products` accepts one `brand` and one `category`, no sizes and no price range. The `/shop` page therefore fetches
up to 200 products once and applies the filter state itself with `features/catalog/domain/facets.ts` (pure, unit-tested). The
same module is bundled into `features/catalog/client/listing-facets.client.ts`, which reads a JSON of item facets embedded in
the page and updates "Show N results" and each option count while the dialog is open.

**Why it matters:** the old page asked the API for `brand` and kept one value, so ticking two brands silently kept one. Do not
move a filter back to the API without also moving the counts; the label and the grid would disagree.

**Limit:** this is fine for a few hundred products. A large catalog needs a server-side facet query.
