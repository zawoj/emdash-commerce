# Changelog

## 2026-11-15

### feat: first public version, extracted from a private monorepo — Claude Code
- Standalone Nx + pnpm monorepo for EmDash commerce: `apps/storefront` (sportswear shop on EmDash, Node + SQLite),
  `packages/plugin-stripe` (Stripe commerce plugin), `packages/plugin-image-hotspots` (image-with-points field widget),
  `packages/design-system` (volt sportswear design system, de-branded).
- Includes the Homepage CTA band, the shop-the-look points and the spotlight callouts (`image-hotspots:hotspots` widget).
- `pnpm seed` (`scripts/seed-demo.mjs`) fills an empty database with a demo catalog and the Homepage entry; photos are
  downloaded from Unsplash on demand into the git-ignored `.cache/`.
- Plugin ids (`stripe-commerce`, `image-hotspots`) and the widget ref (`image-hotspots:hotspots`) are unchanged: content
  and schema store them.
- Stripe fixtures in `packages/plugin-stripe` had their object ids replaced with synthetic ones.
