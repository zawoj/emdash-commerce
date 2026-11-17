# Testing the plugin

## Commands

```bash
pnpm --filter @emdash-commerce/plugin-stripe test
pnpm --filter @emdash-commerce/plugin-stripe typecheck
```

Root gate: `pnpm test` runs all Nx projects.

## Helpers (`@emdash-commerce/plugin-stripe/testing`)

- `createInMemoryWorld()` — ports including relations fake (50-item page rule).
- `createFakeRouteContext` — HTTP route unit tests.
- Stripe JSON fixtures under `src/testing/fixtures/stripe/` (not re-exported from `./testing`).

## What to assert

- Consumer-visible envelopes and error codes at HTTP boundary.
- Seams between helpers (e.g. pricing + checkout session builder), not private implementation trivia.
- `PLUGIN_VERSION` tracks `package.json` (test enforces).

## Real-host tests

`adapters/emdash/real-host/*.real.test.ts` run reconciler, relations, stores against in-memory SQLite EmDash — keep fakes
honest.

## Storefront script tests

`scripts/**/*.test.mjs` are collected by storefront Vitest — use `vitest`, not `node:test`
(`.ai/memory/scripts-tests-run-under-the-storefront-vitest.md`).

## Workers compat

`src/workers-compat.test.ts` guards fetch + Web Crypto assumptions.