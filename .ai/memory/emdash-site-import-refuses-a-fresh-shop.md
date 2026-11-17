---
name: emdash-site-import-refuses-a-fresh-shop
description: emdash site import answers TRANSFER_TARGET_NOT_EMPTY on a fresh shop because the commerce plugin's 19 _emdash_relations rows count as content; start the target with COMMERCE_DEFER_RELATIONS=1, import, remove it, resync
metadata:
  type: project
---

# `emdash site import` refuses a fresh shop

EmDash 1.5's importer (`transfer/domain.ts`, `MUST_BE_EMPTY`, checked by `inspectPortableDomain` in `handleImportCreate` and
again in the `reserve` stage) treats any row in `_emdash_relations` as content. The Stripe plugin's schema reconciler creates 19
relation definitions (`catalog_product_variants`, ...) as soon as it runs on a new database, so a fresh shop was never importable:
`--analyze` answered `TRANSFER_TARGET_NOT_EMPTY` although every collection has zero entries. Nothing in EmDash lets a plugin
mark a relation as scaffold, and the importer has no hook or option.

**Fixed (plugin-stripe, 2026-11-17): `COMMERCE_DEFER_RELATIONS=1` on the target.** While `_emdash_relations` is empty the
reconciler creates the collections without relations, without relation-bound fields and without list columns naming them
(the seed validator rejects a column for a field it does not carry), and skips the data migrations. The marker gets a
`:deferred` suffix; the first start without the variable completes the schema. Why not lazy by default: the admin's product form
needs variants, prices and categories pickers from the very first "New product", and `product_variants.product` is required.
`.ai/decisions/2026-11-17-site-import-into-a-fresh-shop.md`.

- Traps: the setup must be finished **without the starter content** (`/setup/dev-bypass?content=0`; the real wizard offers it too):
  the starter posts, pages, media and revisions also make the site non-empty, and that is not the plugin's doing.
- A shop that already has relations is not changed by the variable. Such a target still needs `DELETE FROM _emdash_relations;`
  (SQLite verified; D1 `wrangler d1 execute ... --remote --command ...` not tried) or a fresh database.
- After the import the plugin's `catalog_links` (Stripe ids) are empty although the products are there; `admin/catalog/sync`
  answers `due: 0` because nothing was queued. Run `pnpm catalog:resync`; until then checkout fails NOT_SYNCED.
- A source that ran `pnpm seed` exports the dev-only `feedback` collection too; delete it on the target.
- The collections themselves are fine: the plugin's `source` is `seed`, which the importer accepts as scaffold.
