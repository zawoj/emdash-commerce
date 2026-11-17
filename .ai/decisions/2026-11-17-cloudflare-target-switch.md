# Cloudflare target: one storefront, a `DEPLOY_TARGET` switch

Date: 2026-11-17 · Task: none (asked in the session)

## Context

`apps/storefront` ran only on Node + SQLite + local uploads. EmDash's official templates ship `-cloudflare` variants
(Workers + D1 + R2) and the owner wanted the shop to run on Cloudflare too, ideally behind a Deploy to Cloudflare button.
Facts checked on 2026-11-17: `@astrojs/cloudflare` 14.x supports Astro 7 (14.3.4 peers `astro ^7.2.0`; 14.4+ need 7.4, we pin
7.3.2); `@emdash-cms/cloudflare` 1.5.0 matches emdash 1.5.0; the plugin source already used only Web APIs (`fetch` Stripe
client, Web Crypto for webhook and token HMAC) and reads secrets from the encrypted settings with `process.env` as the
fallback, which `nodejs_compat` populates on Workers. Cloudflare's Deploy button treats a URL subdirectory as the root of a
new repository and needs the app fully isolated there.

## Decision

1. **One app, an env switch.** `astro.config.mjs` reads `DEPLOY_TARGET`: `cloudflare` selects the Cloudflare adapter, `d1()`
   and `r2()`; anything else is the existing Node/SQLite/local config, byte for byte in behaviour. The runtime packages are
   imported lazily so a target never loads the other's. Plugins, the `@emdash-cms/admin` alias, the dev/build cache split and
   `ssr.noExternal` are shared. `wrangler.jsonc`, `src/worker.ts` (from the EmDash template), generated worker types and
   `*:cloudflare` scripts sit beside it.
2. **Wrangler's runtime types are checked apart** (`tsconfig.cloudflare.json`): they replace the DOM lib, so including them in
   the app's tsconfig breaks every client script.
3. **No code changes in the plugin.** The audit found nothing Node-only; a guard test
   (`packages/plugin-stripe/src/workers-compat.test.ts`) keeps `node:*`, `Buffer`, `require` and stray `process` out, and a
   storefront test keeps `wrangler.jsonc`, `astro.config.mjs` and the `cloudflare` metadata in agreement.
4. **Secrets as Worker secrets**, `secrets.required` = `EMDASH_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`; the webhook secret comes
   from "Register webhook" (stored encrypted), not from an environment variable.
5. **The Deploy button is not offered as working.** The metadata block is in `package.json`; the guide says plainly that the
   button cannot build this monorepo subdirectory.

## Alternatives considered

- **A second app or template (`apps/storefront-cloudflare`)** — rejected: every page, feature and design-system change would
  land twice, and the two would drift. The differences are the adapter, the database, the storage and the entry file.
- **Replace Node with Cloudflare** — rejected: Node + SQLite is the zero-account local and CI path (tests, seed, screenshots).
- **`wrangler.jsonc` only, no switch** — not possible: the adapter and database drivers are chosen in `astro.config.mjs`.
- **A standalone generated template repo for the button** — the way to make the button work (vendor the three workspace
  packages or publish them to npm); not done, noted as a follow-up.
- **Detect Workers Builds (`WORKERS_CI`) to switch targets automatically** — rejected as hidden magic; the build command says
  `build:cloudflare`.

## Consequences

- Node stays the default: `pnpm dev`, `build`, `test`, `typecheck` need no env var. `pnpm typecheck` now also runs
  `tsc -p tsconfig.cloudflare.json`.
- Both targets keep separate local data (`data.db` and `.wrangler/state`). `pnpm seed` works on either through the dev login
  but cannot seed a deployed site (production needs the admin, MCP or `emdash site import`).
- Changing `wrangler.jsonc` means regenerating `worker-configuration.d.ts` (`types:cloudflare`).
- Verified locally on workerd (dev and built bundle, sandbox purchase, signed webhook, cron); a real deploy, email provider,
  passkey login and limits under load were not.
