---
name: scripts-tests-run-under-the-storefront-vitest
description: tests in the repo's scripts/ folder are picked up by apps/storefront's vitest config - write them with vitest (not node:test), they run in happy-dom
---

# Tests under `scripts/` run in the storefront's Vitest

`apps/storefront/vitest.config.ts` includes `../../scripts/**/*.test.mjs`, and `pnpm test` runs it through the `storefront`
Nx project. So a script test is a Vitest file (`import { describe, expect, it } from "vitest"`), not a `node:test` file:
Vitest imports a `node:test` file, finds no suite and reports it as a failure. The environment is `happy-dom`, so use
`node:fs`/`node:path` normally but do not rely on browser globals being absent.

- Applies to `scripts/lib/*.test.mjs` (seed helpers, bootstrap rules, catalog integrity) and `scripts/art/*.test.mjs`.
- The design system is the exception: its lint tests are `node:test` files run by its own `test` script
  (`packages/design-system/package.json`), because that package has no Vitest.
