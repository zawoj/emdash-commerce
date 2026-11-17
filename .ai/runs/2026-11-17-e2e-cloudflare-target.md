# Run: Playwright e2e on the Cloudflare target

Date: 2026-11-17

## Goal

Run the existing Playwright suite against the storefront on workerd (Cloudflare target), with throwaway local state, in CI, and
prove the target switch.

## Steps

1. Read the suite, the setup and the Cloudflare docs and memories. Found the adapter's `persistState` option and wrangler's
   `getVarsForDev` (secrets come from files, optional secrets are dropped, `.dev.vars.<env>` wins and hides `.env`).
2. Added `E2E_TARGET`, `EMDASH_CLOUDFLARE_STATE_DIR`, the generated `.dev.vars.e2e`, the measured runtime and `target.spec.ts`.
3. First smoke run on workerd: 40 passed, 1 failed (`cart.spec.ts` removal test: the cart-cookie race, fixed in the helper).
4. First purchase run: "Paid" but no order number: webhooks answered 503 (optional secret dropped); stored the signing secret as the
   plugin setting before the seed. One run stalled at Stripe's Pay button (hosted page, not reproduced; the next run passed).
5. Mutation: the Cloudflare target started the Node server, `target.spec.ts` failed (`workerd` expected, `node` received); reverted.
6. CI job `smoke-cloudflare`; the weekly purchase job runs both targets. `zizmor` (offline mode) reports no findings.

## Verification

- `pnpm test:e2e:smoke:cloudflare`: 41 passed, 4 skipped (known fixme), about 2.2 minutes.
- Purchase project with `E2E_TARGET=cloudflare` and a sandbox restricted key: 3 passed; every forwarded webhook answered 200.
- `E2E_PORT=4383 pnpm test:e2e:smoke` (Node): 41 passed, 4 skipped.

## Outcome / follow-ups

- Not covered: the built Worker, real D1/R2, a deploy. CI timing on a GitHub runner is not measured yet.
- The CI Stripe CLI is 1.55.11; the local one was 1.40.3 (both accepted `--all-snapshot`).
