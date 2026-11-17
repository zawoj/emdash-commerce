# End-to-end tests on the Cloudflare target: `E2E_TARGET`, `astro dev` on workerd

Date: 2026-11-17 · Task: ROADMAP, "the Cloudflare target is verified by hand"

## Context

The Playwright suite (`2026-11-17-e2e-playwright-suite.md`) ran only against the Node server, while the Cloudflare target
(`2026-11-17-cloudflare-target-switch.md`) had only been checked by hand. The seed signs in through the dev login, which exists only
under `astro dev` (`import.meta.env.DEV`), and EmDash reads the site URL at startup. `@astrojs/cloudflare` 14 runs `astro dev` on
workerd through `@cloudflare/vite-plugin`; its `persistState` option moves the local D1/R2/KV/Durable Object state; wrangler
passes secrets to workerd only from `.dev.vars` / `.env` (not the process environment) and, because `wrangler.jsonc` declares
`secrets`, only the required ones.

## Decision

1. **`E2E_TARGET` (`node` default, `cloudflare`)**, vocabulary `E2E_TARGETS` in `e2e/support/config.ts`; an unknown value stops the
   run. Root scripts `test:e2e:smoke:cloudflare` and `test:e2e:cloudflare`. The specs are shared and unchanged; the target only
   changes how the setup starts the server (port 4381, own run directory `.e2e-cloudflare/`).
2. **The server is `DEPLOY_TARGET=cloudflare astro dev`**, not the built Worker under `wrangler dev`. The seed needs the dev login and
   the purchase suite reads the in-memory dev mailbox, both dev-only; a built Worker would need a different way to seed and to read
   emails, and the by-hand check in `docs/cloudflare.md` already covers the built bundle once. The cost is stated in the docs: the
   suite proves the app on workerd, not the production bundle.
3. **Throwaway state through one env var**: `EMDASH_CLOUDFLARE_STATE_DIR` in `astro.config.mjs` becomes the adapter's
   `persistState: { path }` (unset: the adapter's default, `apps/storefront/.wrangler/state`, unchanged). The suite points it at
   `.e2e-cloudflare/state`.
4. **Secrets through a generated `.dev.vars.e2e` and `CLOUDFLARE_ENV=e2e`**: wrangler reads the env-specific file first and then never
   reads `.env`, so a keyless run cannot pick up the developer's keys. The file is mode 600, ignored by version control and removed by
   the teardown and an exit handler. The webhook signing secret is stored as the plugin's encrypted setting through the admin API
   before the seed, because wrangler drops optional secrets.
5. **The runtime is measured**: the setup finds a `workerd` process in the server's process group and `target.spec.ts` asserts that it
   matches `E2E_TARGET`.
6. **CI**: a `smoke-cloudflare` job on every pull request and push, parallel to `smoke` (about 2.2 minutes locally against 53 seconds for
   Node; it is the only automated check of the Worker target, and a PR that touches only the adapter, the worker entry or a plugin
   must see it). The weekly purchase job also runs the purchase specs with `E2E_TARGET=cloudflare` after the Node run.

## Alternatives

- **The built Worker under `wrangler dev`**: closer to production, but no dev login (no seed) and no dev mailbox; the seed would
  have needed an authenticated import path that does not exist for an empty site.
- **Put the secrets in `apps/storefront/.dev.vars`**: it would overwrite a developer's own file; the env-specific file does not.
- **Disable `.env` loading with `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV=false`**: it also stops `process.env` from being merged, so no
  secret would arrive at all without a `.dev.vars`.
- **A custom wrangler config in `.e2e-cloudflare/` (`configPath`)** to keep the secrets file inside the run directory: needs a copy
  of `wrangler.jsonc` that can drift from the real one.
- **A weekly-only Cloudflare smoke**: cheaper, but a break in the Worker target would be found up to a week late.
- **Skipping specs that fail on workerd**: none needed; one real race in a helper was fixed instead.

## Consequences

- `pnpm test:e2e:smoke:cloudflare`: 41 passed, 4 skipped (the known `test.fixme` contrast cases, as on Node); the purchase project passes
  too (3 tests).
- A spec that fails only on workerd points at a real difference between the targets, or at a race Node hides (the cart-cookie one).
- Wrangler prints a warning that `wrangler.jsonc` has no `env.e2e` in the server log; harmless.
- `apps/storefront/.dev.vars.e2e` exists only while a Cloudflare run is in progress; a run killed with SIGKILL can leave it behind
  (it holds a throwaway encryption key and, in a purchase run, a sandbox Stripe key; it is ignored by version control).
- The suite does not cover the built Worker, a real D1/R2, or a real deploy.
