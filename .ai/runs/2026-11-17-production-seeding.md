# Run: production seeding and seed.json hygiene

Date: 2026-11-17 · Goal: seed a deployed site with an access token, document export/import, keep `feedback` out of the production seed.

## Steps

1. Read the seed script, `seed.json`, the Notes dev tool, EmDash 1.5 token scopes (`@emdash-cms/auth`), plugin route auth and the
   transfer (import) code.
2. Moved `feedback` to `apps/storefront/seed/dev-tools.json`; `pnpm seed` creates it only on the dev-login path.
3. Extracted the HTTP client to `scripts/lib/emdash-client.mjs` (dev login or bearer token, scope probes, setup check);
   added `pnpm catalog:resync`; the seed exits 1 on a sync timeout or failures.
4. Ran it for real: dev server seed; built server on a fresh database with a limited and an admin token; export from a dev
   site and import into a fresh built site; `pnpm catalog:resync`.
5. Docs (`production.md`, `cloudflare.md`, `getting-started.md`), ADR, two memories.

## Verification

Vitest for the client, dev tools and seed files, each proven by mutation (6 killed, 1 equivalent survivor); `pnpm check:ai`, `lint`,
`typecheck`, `test`, `build`; `E2E_PORT=4382 pnpm test:e2e:smoke` (40 passed). Real runs are listed in `docs/production.md`.

## Outcome and follow-ups

Done as above. Found: `emdash site import` is refused on a fresh shop by the plugin's `_emdash_relations` rows (memory
`emdash-site-import-refuses-a-fresh-shop`); not fixed. Not run: D1/R2, a real host, a live Stripe account.
