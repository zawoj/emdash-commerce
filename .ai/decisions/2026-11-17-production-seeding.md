# Production seeding: access-token seed, dev tools out of the production seed

Date: 2026-11-17 · Task: ROADMAP "Production seeding" and "Production `seed.json` hygiene"

## Context

`pnpm seed` signed in through the dev login (`/auth/dev-bypass`, `/setup/dev-bypass`), which exists only under `astro dev`, so a
deployed site could not be seeded. `apps/storefront/seed/seed.json` (inlined by the build, applied once by the first request)
also carried the `feedback` collection of the Notes dev tool, which a real production site should not get.

Facts checked in EmDash 1.5.0 (`node_modules/emdash`, `@emdash-cms/auth`) and by running a built server:

- Personal access tokens (`ec_pat_…`, `Authorization: Bearer`) are accepted by the REST API; scopes: `content:read|write`,
  `media:read|write`, `schema:read|write`, `taxonomies:manage`, `menus:manage`, `settings:read|manage`, `mcp:tools`,
  `transfer:export|analyze|execute`, `admin` (grants all). A missing scope answers 403 `INSUFFICIENT_SCOPE` naming it.
- A plugin's private routes (`admin/*`, which the seed uses for stock and the catalog sync) require the **`admin`** scope and the
  `plugins:manage` permission of the token's user. No narrower scope grants them.
- `/auth/me` needs the admin scope, so it cannot be used to validate a minimal token. `/setup/status` is public.
- Setup (the first administrator) needs a passkey on a deployed site; nothing can do it for a script.
- The Node build bakes the SQLite path into the bundle (`.ai/memory/emdash-node-build-bakes-the-database-path.md`).

## Decision

1. **`feedback` leaves `seed.json`.** Its definition moves to `apps/storefront/seed/dev-tools.json` (same seed format, so
   `emdash seed seed/dev-tools.json --no-content` also applies it). `pnpm seed` creates it through the schema REST API
   (`scripts/lib/dev-tools.mjs`) **only on the dev-login path**. The Notes tool already answers `MISSING` with the command when
   the collection is absent; the command now points to the fragment. Chosen over "the Notes tool creates the collection on
   first use": that puts schema writes in browser code and needs `schema:manage` from the editor's session, while the seed
   script already runs the same calls with an admin session, and `e2e/global-setup.ts` runs `pnpm seed` against a dev server,
   so the e2e suite and a fresh clone get the collection without any change. The committed `emdash-env.d.ts` keeps the
   `Feedback` type (the dev server regenerates it from whichever database it runs on; nothing in `src` imports it).
2. **`EMDASH_TOKEN` switches `pnpm seed` to bearer auth** (`scripts/lib/emdash-client.mjs`). With a token: no dev route is
   called, no cookie is kept, `EMDASH_URL` must be `https://` unless it is loopback, a value without the `ec_pat_` prefix is refused,
   the token is never printed. Before writing, `/setup/status` must say the wizard is done (otherwise stop and say so) and each
   needed scope is probed with a request that changes nothing (a 403 `INSUFFICIENT_SCOPE` is the only answer that counts), so a
   token that lacks a scope stops the run with exit code 1 before the first write instead of half-seeding.
3. **The seed stays idempotent and now ends with an exit code**: 1 when the catalog sync times out or has failures. It creates the
   `home` entry when the collection exists but the entry does not (a deployed site has no sample content).
4. **`pnpm catalog:resync`** runs only the resync with the same client (`scripts/catalog-resync.mjs`), for after an import.
5. **Export/import is documented, not scripted**: `emdash site export` → `import --analyze` → `--plan <digest> --confirm` →
   `pnpm catalog:resync`. The CLI already reads `EMDASH_URL` / `EMDASH_TOKEN`.

## Alternatives

- A dev-only seed applied at build time (two `emdash.seed` files by environment): the build would need to know what it is for;
  a script flag is simpler and the production seed stays a single static file.
- Minting a token inside the seed through the dev login: works only locally, which is not the point.
- Calling `/auth/me` to validate the token: needs `admin`, so it would reject a legitimately narrower token.
- Making the seed accept a live Stripe key: the repository rule is sandbox keys for demo data; the sync still refuses a live key.

## Consequences

- A deployed shop is seeded with one command and two values, after a person finished the setup wizard.
- Re-running overwrites editor changes to the seeded products (matched by slug) and re-queues the Stripe catalog.
- `emdash site import` into a fresh shop is refused until the 19 relation definitions the commerce plugin created are cleared
  (`.ai/memory/emdash-site-import-refuses-a-fresh-shop.md`). Not fixed here; a plugin or EmDash follow-up.
- Verified only on a local built Node server; D1/R2 and a real host are not covered.
