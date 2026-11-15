---
name: emdash-admin-infinite-loading
description: apps/storefront admin loads forever in dev (createRoot hydration error) — fixed by pre-bundling React in the Vite config
---

# EmDash admin stuck on the loading screen

**Symptom:** `/_emdash/admin` returns 200 but the page never leaves the spinner. The dev log (`astro dev logs`)
shows `Error hydrating …/emdash/dist/astro/routes/PluginRegistry.mjs SyntaxError: The requested module
'…/react-dom/client.js' does not provide an export named 'createRoot'`.

**Cause:** EmDash's admin islands live in the pnpm store, outside the app root, so Vite does not pre-bundle
`react-dom/client` and serves the raw CommonJS file to the browser. Clearing `node_modules/.vite` and aligning
the React version with the rest of the repo did *not* help.

**Fix:** `apps/storefront/astro.config.mjs` sets `vite.optimizeDeps.include` to `react`, `react-dom`,
`react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime`. After changing it, clear `node_modules/.vite`
and restart with `astro dev --force`. Check in a real browser — `curl` returns 200 either way.

Related: `astro dev` backgrounds itself when it detects an agent (`astro dev stop` / `status` / `logs`).
