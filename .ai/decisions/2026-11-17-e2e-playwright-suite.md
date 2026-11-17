# End-to-end tests: Playwright, a throwaway dev server, smoke without secrets

Date: 2026-11-17 · Task: none (asked in the session)

## Context

The repo had unit tests per package and design-system lints, but nothing that drove the shop in a browser, so a page, a
route, a client script and the plugin API could each be right and still not fit. EmDash itself ships a root
`playwright.config.ts` and `e2e/`, and `cloudflare/templates` runs Playwright per template. The storefront stores everything
in `apps/storefront/data.db` and `uploads/`, its seed signs in through the dev login (`astro dev` only), and EmDash reads the
site URL at server start, so a fresh database needs one restart after the first seed. A real purchase needs a Stripe
sandbox, hosted Checkout and a webhook forwarder.

## Decision

1. **Playwright at the repo root**: `playwright.config.ts`, tests in `e2e/tests/`, helpers in `e2e/support/`, an `e2e` Nx
   project whose `typecheck` target runs `tsc` over `e2e/` and the config, so `pnpm typecheck` covers it. One worker, no
   retries.
2. **One server, owned by the global setup, not a `webServer` block.** The setup starts `astro dev` on port 4380, seeds it
   with `scripts/seed-demo.mjs`, restarts it once, warms the routes and returns a teardown. A `webServer` cannot restart a
   server in the middle of the setup, and the Stripe webhook secret has to be known before the server starts.
3. **A throwaway state directory** (`.e2e/`, deleted at the start of every run): `apps/storefront/astro.config.mjs` reads
   `EMDASH_DATABASE_FILE` and `EMDASH_UPLOADS_DIR` (defaults unchanged, the Cloudflare branch untouched). The dev server is
   started without the `dev` script so `apps/storefront/.env` is never loaded; the server's environment is built from the
   host's minus `STRIPE_*`, `EMDASH_*`, `COMMERCE_*` and `DEPLOY_TARGET`, plus a per-run encryption key.
4. **Two projects.** `smoke` runs with `E2E_STRIPE=off`: no Stripe key at all, no secrets, runs on every PR. `purchase` needs a
   sandbox key (`sk_test_`/`rk_test_`, anything else stops the run) and the Stripe CLI; the setup starts `stripe listen`
   itself with `STRIPE_API_KEY` in its environment and reads the signing secret from the CLI, because the secret differs per
   CLI login. Without them the purchase specs skip themselves with a message.
5. **CI** (`.github/workflows/e2e.yml`): smoke on every PR and push; the purchase job on `workflow_dispatch` and weekly, only
   in `zawoj/emdash-commerce`, with the repository secret `STRIPE_SANDBOX_SECRET_KEY` and a pinned, checksum-verified Stripe
   CLI.
6. **Specs are proven by mutation** (break the page, watch the spec fail, restore), and known design-system accessibility
   failures are excluded from the page checks and kept as `test.fixme` with their reason.

## Alternatives

- *`webServer` in the Playwright config.* Cannot do the post-seed restart; would need a wrapper process and a readiness
  endpoint just to emulate the setup.
- *Run against the developer's own `pnpm dev` and `data.db`.* Not reproducible, and it would write orders into the real
  database.
- *Seed once and reuse the server between runs.* Faster, but a run could then depend on what a previous one left behind.
- *A built server (`astro build` + `start`).* There is no dev login there, so the seed could not run.
- *Retries.* They hide flaky tests; the suite uses web-first assertions and fixes the cause instead.

## Consequences

- A smoke run takes about 40 seconds in all (about 15 of them setup); with a Stripe key about 75 (the seed then syncs the
  catalog to Stripe). Smoke is the part to run before a PR that touches a page, a route, the cart or the order pages.
- The suite only works while the seed signs in through the dev login and `astro dev` is the server it starts.
- The Stripe sandbox accumulates Products, Prices and Customers on every purchase run; harmless.
- The dev mailbox (`/_emdash/api/dev/emails`) is how the suite reads emails: it is in memory and dev-only.
- Seed data is asserted by value in `e2e/support/catalog.ts`; changing the seed means updating that file.
