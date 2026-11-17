---
name: cloudflare-dev-cold-cache-reoptimize
description: astro dev on workerd exits on a cold Vite cache when a dependency is discovered late (React renderer, stripe, astro/container); pre-bundle them in environments.ssr.optimizeDeps.include for the cloudflare target
metadata:
  type: project
---

# Cold-cache `dev:cloudflare` crashes on a late dependency discovery

With `DEPLOY_TARGET=cloudflare` and no `node_modules/.vite-dev` (every CI run, or after deleting it), the server printed
`dependency optimized: @astrojs/react/server.js` -> `optimized dependencies changed. reloading` and then
`The file does not exist at ".../.vite-dev/deps_ssr/sequence-*.js ... which is in the optimize deps directory` (stack in
`workers/runner-worker`), and exited. The re-optimization replaces the pre-bundled chunk files while workerd is loading them.
Warm caches hide it. Reproduced on the first cold run; the e2e setup's `waitForHttp` reported "exited before it answered".

Cause: the adapter's SSR `optimizeDeps.include` list is fixed up front, but three imports were found only while requests ran:
`@astrojs/react/server.js`, `stripe` (a dependency of the plugin, so the include is `@emdash-commerce/plugin-stripe > stripe`)
and `astro/container`. Fix (not a retry): `vite.environments.ssr.optimizeDeps.include` with those three, only when
`isCloudflare`, in `apps/storefront/astro.config.mjs`. The adapter merges it with its own list (the environment is named `ssr`).
After the fix three cold runs showed no "dependency optimized" line at all.

How to apply: if a new dependency shows `dependency optimized: <name>` in a cold `.e2e-cloudflare/server-first.log`, add it to that
list. Related: [[emdash-admin-infinite-loading]] (the same idea for the client's React).
