---
name: cloudflare-deploy-button-needs-an-isolated-subdirectory
description: the Deploy to Cloudflare button cannot build apps/storefront from this monorepo (workspace:* packages); it works from the generated `cloudflare-template` branch (pnpm template:cloudflare)
metadata:
  type: reference
---

# The Deploy button cannot deploy a pnpm-workspace subdirectory — use the generated template branch

Cloudflare's Deploy button docs (Limitations, read 2026-11-17): with a subdirectory in the URL, "your application must be
fully isolated within that subdirectory, including any dependencies ... Cloudflare treats this subdirectory as the root of the
new repository". `apps/storefront` depends on `@emdash-commerce/design-system`, `plugin-stripe` and `plugin-image-hotspots`
as `workspace:*`; they are not on npm and are not copied, so
`https://deploy.workers.cloudflare.com/?url=https://github.com/zawoj/emdash-commerce/tree/main/apps/storefront` fails to
install or build. Do not point a button at `main/apps/storefront`.

- What works: `pnpm template:cloudflare` (`scripts/template/`) generates a standalone copy (packages vendored with
  `pnpm pack` as `file:./vendor/<name>`, `build` = Cloudflare build, `deploy` = `wrangler deploy`); the workflow
  `.github/workflows/cloudflare-template.yml` force-pushes it to the orphan branch `cloudflare-template`, and the button URL is
  `https://deploy.workers.cloudflare.com/?url=https://github.com/zawoj/emdash-commerce/tree/cloudflare-template`. The branch
  does not exist until the workflow has run once on `main`. Decision: `.ai/decisions/2026-11-17-cloudflare-deploy-template.md`.
- The button pre-fills the `build` and `deploy` scripts of the copy's `package.json`; the repo's `build` is the Node build, which
  is why the copy has its own manifest.
- The `cloudflare` block in `apps/storefront/package.json` (label, products, binding descriptions) is what the button shows;
  the generator carries it into the copy, so edit it there.
- Traps hit while building the generator: pnpm 10 skips install scripts, so the copy needs `pnpm.onlyBuiltDependencies`
  (`esbuild`, `sharp`, `workerd`); `axe-core` looks like a test dependency but `src/dev-tools` imports it at build time, so only
  `vitest` and `happy-dom` are dropped; the generator must copy the root `pnpm.overrides` (`@types/react`).
- Not tried (needs an account): pressing the button, and Workers Builds with a root directory (`apps/storefront`, build
  `pnpm --filter @emdash-commerce/storefront build:cloudflare` from the repo root) — that remains the second option.
  Details: `docs/cloudflare.md`.
