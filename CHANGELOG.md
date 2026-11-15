# Changelog

## 2026-11-15 (QA fixes)

### fix: PDP gallery and mini-cart never empty; neutral shop identity — Claude Code
- The PDP gallery rendered only the photos of the colour chosen at page load, all tagged with that colour, so picking
  another colour hid every slide. It now renders every photo with its real colour (product photos untagged) and the
  client filter (`visiblePhotoIndexes`) shows the chosen colour's photos, else the untagged ones, else all.
- Cart lines had no thumbnail (always the placeholder). The cart summary now picks the variant's photo, else the
  product's first photo (`pickLineImage`).
- Site identity: `seed.json`, the fallback in `site-identity.ts` and `pnpm seed` (new `site` step, a settings merge, so
  idempotent) set title "EmDash Commerce" and tagline "Demo sportswear shop on EmDash and Stripe". An existing database
  gets it by re-running `pnpm seed`.

## 2026-11-15 (wireframe skin)

### feat: blue wireframe skin for the storefront — Claude Code
- `packages/design-system` and `apps/storefront` take the look of the zavcode design system: a blue wireframe with no
  decoration (see `packages/design-system/CHANGELOG.md` and `.ai/decisions/2026-11-15-wireframe-skin.md`). Visuals only:
  no change to layouts, props, copy, data flow or the admin.
- The `design-system` `test` target now also runs `wireframe-lint` over the package and `apps/storefront/src`, plus a
  fixture test for it. The Archivo dependency is gone from both packages.
- Blog pages: the template's radii, shadows and tracking are zeroed in `src/styles/theme.css`; the unused
  `components/ProductCard.astro` is deleted. Blog colours are still the template's neutral greys.
- Why: one coherent, accessible, decoration-free look that can be linted instead of reviewed by eye.

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
- Home defaults (hero, spotlight, activity images) are Unsplash URLs instead of media keys of one local database.
