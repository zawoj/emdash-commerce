---
name: cloudflare-deploy-button-needs-an-isolated-subdirectory
description: the Deploy to Cloudflare button cannot build apps/storefront from this monorepo (workspace:* packages); what works instead is Workers Builds with a root directory
metadata:
  type: reference
---

# The Deploy button cannot deploy a pnpm-workspace subdirectory

Cloudflare's Deploy button docs (Limitations, read 2026-11-17): with a subdirectory in the URL, "your application must be
fully isolated within that subdirectory, including any dependencies ... Cloudflare treats this subdirectory as the root of the
new repository". `apps/storefront` depends on `@emdash-commerce/design-system`, `plugin-stripe` and `plugin-image-hotspots`
as `workspace:*`; they are not on npm and are not copied, so
`https://deploy.workers.cloudflare.com/?url=https://github.com/zawoj/emdash-commerce/tree/main/apps/storefront` fails to
install or build. Do not put the button in a README as if it worked.

- The `cloudflare` block in `apps/storefront/package.json` (label, products, binding descriptions) is ready for the day
  there is a standalone copy (vendored packages or npm publish).
- The button also pre-fills the `build` and `deploy` scripts of `package.json`; here `build` is the Node build, so even a
  working button would need `build:cloudflare`.
- What can work today (not tried, needs an account): Workers & Pages → import the Git repo → root directory
  `apps/storefront`, build `pnpm --filter @emdash-commerce/storefront build:cloudflare` from the repo root, deploy
  `pnpm exec wrangler deploy`.
- Details: `docs/cloudflare.md`.
