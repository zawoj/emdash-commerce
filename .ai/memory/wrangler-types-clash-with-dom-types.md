---
name: wrangler-types-clash-with-dom-types
description: worker-configuration.d.ts (wrangler types) replaces the DOM lib, so it must not be in the storefront tsconfig — it breaks every client script with 17 type errors; it is checked by tsconfig.cloudflare.json
metadata:
  type: project
---

# Wrangler's generated runtime types cannot share a tsconfig with DOM code

Adding `worker-configuration.d.ts` to `apps/storefront/tsconfig.json` (what the EmDash Cloudflare templates do, they have no
client scripts) made `astro check` fail with 17 errors such as `Argument of type 'HTMLDivElement' is not assignable to
parameter of type 'string | Response | ReadableStream<any>'` (`appendChild`, `querySelector`, ...): the workers types declare
their own `Element`/`Node`-like globals over the DOM ones.

- `tsconfig.json` excludes `src/worker.ts`; `tsconfig.cloudflare.json` (lib `ESNext`, no DOM, `types: []`) includes only the
  Worker entry and the generated types. `pnpm typecheck` runs both (`astro check && tsc -p tsconfig.cloudflare.json`).
- `wrangler types` reads the secret names from `.dev.vars` / `.env` when `wrangler.jsonc` has no `secrets.required`, so the
  committed file changed with whoever ran it. `secrets.required` makes the output deterministic; regenerate with
  `pnpm --filter @emdash-commerce/storefront types:cloudflare` after any `wrangler.jsonc` change (move your `.dev.vars`
  aside only if you removed `secrets.required`).
- `SESSION` (KV) and `IMAGES` are added by `@astrojs/cloudflare` at build time and are not in `wrangler.jsonc`, so they are
  not in the generated types.
