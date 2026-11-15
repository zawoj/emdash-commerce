---
name: emdash-dev-and-build-share-vite-cache
description: apps/storefront admin stuck on "Loading EmDash..." after a build — `astro build` overwrote the running dev server's Vite cache; dev and build now use separate cache dirs
metadata:
  type: project
---

# Admin hangs after `pnpm build` (or the gate) next to a running dev server

**Symptom:** `/_emdash/admin` returns 200 but stays on "Loading EmDash…". The dev log (`astro dev logs`) shows
`TypeError: Cannot read properties of null (reading 'useState')` from `AdminApp`, with a stack that mixes
`react.production.js` and `react-dom-client.development.js` — React is loaded twice. The site pages still work.

**Cause:** `astro dev` and `astro build` use the same Vite cache folder (`node_modules/.vite`). A build started while
the dev server runs (for example `pnpm nx run-many -t typecheck test build`) rewrites the pre-bundled dependencies the
server serves; the browser then gets chunks from two optimizer runs. The dep hash on disk differs from the one the
server reports.

**Fix:** `apps/storefront/astro.config.mjs` has a small Vite plugin that sets `cacheDir` per command:
`node_modules/.vite-dev` for `serve`, `node_modules/.vite-build` otherwise. After changing it, stop the server, delete
`node_modules/.vite*` and `.astro`, and start with `astro dev --force`. A server started before this fix still needs
that restart. Related: [[emdash-admin-infinite-loading]] (the earlier `createRoot` variant of the same page hanging).
