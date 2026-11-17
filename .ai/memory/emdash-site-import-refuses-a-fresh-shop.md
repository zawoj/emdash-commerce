---
name: emdash-site-import-refuses-a-fresh-shop
description: emdash site import answers TRANSFER_TARGET_NOT_EMPTY on a fresh shop because the commerce plugin's 19 _emdash_relations rows count as content; clear them, import, then resync the catalog
metadata:
  type: project
---

# `emdash site import` refuses a fresh shop

EmDash 1.5's importer (`transfer/domain.ts`, `MUST_BE_EMPTY`) treats any row in `_emdash_relations` as content. The Stripe
plugin's schema step creates 19 relation definitions (`catalog_product_variants`, `catalog_product_prices`, ...) as soon as the
plugin starts on a new database, so a freshly deployed shop is never importable: `--analyze` answers
`TRANSFER_TARGET_NOT_EMPTY` ("This site already has content") even though every collection has zero entries.

- Checked locally on SQLite: `DELETE FROM _emdash_relations;` on the target (server stopped or idle), then `--analyze`
  passes (`blockers: []`, `executable: true`) and `--confirm` imports the package including its 19 relations. The server did not
  recreate the rows before the analyze. On D1 the same delete is `wrangler d1 execute ... --remote --command ...` (not tried).
- The collections themselves are fine: the plugin's `source` is `seed`, which the importer accepts as scaffold.
- After the import the plugin's `catalog_links` (Stripe ids) are empty although the products are there; `admin/catalog/sync`
  answers `due: 0` because nothing was queued. Run `pnpm catalog:resync`; until then checkout fails NOT_SYNCED.
- A source that ran `pnpm seed` exports the dev-only `feedback` collection too; delete it on the target.
- Cleaner long-term fixes (not done): the plugin creating its relations lazily, or EmDash ignoring definition-only relation rows.
