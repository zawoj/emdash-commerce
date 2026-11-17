# Site import into a fresh shop: `COMMERCE_DEFER_RELATIONS`

Date: 2026-11-17 · Task: ROADMAP "`emdash site import` into a fresh shop"

## Context

`emdash site import --analyze` answered `TRANSFER_TARGET_NOT_EMPTY` on every freshly set-up shop. Facts read in EmDash 1.5.0
(`node_modules/emdash/dist/transfer-B3CsI5MG.mjs`):

- `inspectPortableDomain` (line 539) probes the `MUST_BE_EMPTY` tables (line 509); `_emdash_relations` is one of them (line 511).
  It runs in `handleImportCreate` (analyze) and again in the `reserve` stage of the import. A relation row is a blocker, full stop.
- Collections whose `source` is `seed` (the plugin's are) are scaffold: the importer deletes them in `clear_scaffold` and
  recreates them, their fields and the relations from the package. So the 19 relation rows are the only blocker of a fresh shop
  (checked: with the plugin's schema in place `_emdash_relations` was the only non-empty table).
- There is no option, ignore list, hook or plugin callback in the importer; nothing marks a relation as scaffold.
- The plugin's reconciler creates the relations with `applySeed` (`registry-port.ts`), together with the fields bound to them: a
  relation-bound field needs its relation row, and EmDash refuses to render or save a collection whose field names a missing one.

## Decision

An environment variable, **`COMMERCE_DEFER_RELATIONS=1`**, for a shop that is about to receive an import. While it is set **and**
`_emdash_relations` has no row, the schema reconciler (`ensureSchema`, `withoutRelations`) creates the collections without any
relation, without the fields bound to a relation and without the list columns that name those fields (the seed validator
rejects such a column), and `ensureReady` skips the data migrations. The schema marker is stored with a `:deferred` suffix.
The first start without the variable finds a marker that does not match, runs the normal additive reconcile and adds the missing
relations and fields (the machinery that already upgrades old databases). An existing site (any relation present) is reconciled in
full whatever the variable says.

Documented flow (`docs/production.md`): deploy the fresh shop with the variable, finish setup without the starter content,
`emdash site import --analyze` / `--plan --confirm`, remove the variable and restart, `pnpm catalog:resync`.

## Alternatives rejected

- **Lazy by default (relations created on the first catalog write, or deferred while the site has no content).** The admin
  needs the pickers before the first write: "New product" must show variants, prices, categories, and `product_variants.product`
  is `required`. A first product saved without them, then a hook that adds the fields, then a reload, is a regression for every
  shop that starts from scratch, and a visit to `/shop` or the cron (both call `ensureReady`) would have to be told apart from a
  real write. The first save also makes the site "not empty" again. An explicit opt-in keeps the default path unchanged.
- **Teach EmDash about it** (an ignore list, a `scaffold` flag on a relation): the right long-term fix, but it is an upstream
  change; nothing in 1.5.0 offers it, and patching `node_modules` is out.
- **A plugin route or script that deletes the relations before the import** (a "release schema" step): still a manual step
  and a destructive one; the variable needs no extra command and deletes nothing.
- **Skip the whole reconcile while deferring**: leaves the storefront and the cron reading collections that do not exist.

## Consequences

- One more variable to know about, mentioned in `docs/production.md`, the plugin README, `.env.example`, `docs/cloudflare.md`.
  The importer's error message does not name it; the docs do.
- While it is set the product form has no relation pickers: do not create products by hand until it is removed. Leaving it set
  after the import is harmless (relations exist, so the reconcile is full) apart from the `:deferred` marker satisfying the
  warm-start check, which skips later schema updates until the variable is removed and the process restarted.
- A shop that was started without the variable already has the relations: it needs a new database or the one-off
  `DELETE FROM _emdash_relations;` (SQLite verified, D1 not tried).
- The setup must be finished without the starter content (`/setup/dev-bypass?content=0` in dev); that content also blocks the
  importer and is unrelated to the plugin.
- Verified by running it (`docs/production.md`), not on a built server, D1 or a remote host.
