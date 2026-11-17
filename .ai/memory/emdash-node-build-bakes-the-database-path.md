---
name: emdash-node-build-bakes-the-database-path
description: astro build inlines EMDASH_DATABASE_FILE / EMDASH_UPLOADS_DIR, so a built Node server ignores them at start and opens ./data.db - set them when you BUILD
metadata:
  type: project
---

# The Node build bakes the database path

`astro.config.mjs` reads `EMDASH_DATABASE_FILE` and `EMDASH_UPLOADS_DIR` while the config is evaluated. `astro dev` evaluates it at
start, so the variables move the dev server's SQLite file and uploads. `astro build` evaluates it at build time and writes the
paths into `dist/server`: `node dist/server/entry.mjs` with the variables set **still opens `apps/storefront/data.db`** (and
creates it next to the app, empty, with a setup prompt) while you think you are testing a throwaway site.

- To run the built server on a throwaway database, build with the variables set:
  `EMDASH_DATABASE_FILE=/tmp/x/data.db EMDASH_UPLOADS_DIR=/tmp/x/uploads pnpm exec astro build` in `apps/storefront`, then start
  with the same values. The default build (`pnpm build`) uses `./data.db` relative to the process directory.
- The symptom is `/setup/status` answering `needsSetup: true` on a database you already set up, or a stray `data.db` in
  `apps/storefront` (git-ignored).
- The built server has no dev login. To finish the setup of a throwaway database, run a dev server on the same file
  (`/setup/dev-bypass`), mint a token (`POST /admin/api-tokens` with the dev session), stop it, start the built server.
