This is an EmDash site -- a CMS built on Astro with a full admin UI.

## Commands

```bash
pnpm dev              # From the repo root: the storefront dev server on port 4360
npx emdash types      # Regenerate TypeScript types from a running site
```

Cloudflare (Workers + D1 + R2) is a second runtime target of this same app, chosen with `DEPLOY_TARGET=cloudflare` in
`astro.config.mjs` (unset = Node/SQLite, the default). Scripts: `dev:cloudflare --port <n>`, `build:cloudflare`,
`deploy:cloudflare`, `types:cloudflare`; config in `wrangler.jsonc` and `src/worker.ts`. Guide, secrets and limits:
`docs/cloudflare.md` at the repo root. Run `types:cloudflare` after changing `wrangler.jsonc`.

The admin UI is at `http://localhost:4360/_emdash/admin`.

## Key Files

| File                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `astro.config.mjs`       | Astro config with `emdash()` integration, database, and storage                    |
| `src/live.config.ts`     | EmDash loader registration (boilerplate -- don't modify)                           |
| `seed/seed.json`         | Schema definition + demo content (collections, fields, taxonomies, menus, widgets) |
| `emdash-env.d.ts`        | Generated types for collections (auto-regenerated on dev server start)             |
| `src/layouts/Base.astro` | Base layout with EmDash wiring (menus, search, page contributions)                 |
| `src/pages/`             | Astro pages -- all server-rendered                                                 |

## Skills

Agent skills are in `.agents/skills/`. Load them when working on specific tasks:

- **building-emdash-site** -- Querying content, rendering Portable Text, schema design, seed files, site features (menus, widgets, search, SEO, comments, bylines). Start here.
- **creating-plugins** -- Building EmDash plugins with hooks, storage, admin UI, API routes, and Portable Text block types.
- **emdash-cli** -- CLI commands for content management, seeding, type generation, and visual editing flow.

## Documentation

The EmDash docs are available as an MCP server at `https://docs.emdashcms.com/mcp`. When you need to verify an API, hook, config option, field type, or pattern, call `search_docs` against the live documentation rather than relying on training-data recall. The docs reflect current behaviour; assumptions may not.

This template ships with `.mcp.json`, `.cursor/mcp.json`, and `.vscode/mcp.json` so Claude Code, Cursor, and VS Code auto-discover the docs server. Other tools (OpenCode, Windsurf, etc.) need a manual one-time setup -- see [docs.emdashcms.com/docs-mcp](https://docs.emdashcms.com/docs-mcp).

## Rules

- All content pages must be server-rendered (`output: "server"`). No `getStaticPaths()` for CMS content.
- Image fields are objects (`{ src, alt }`), not strings. Use `<Image image={...} />` from `"emdash/ui"`.
- `entry.id` is the slug (for URLs). `entry.data.id` is the database ULID (for API calls like `getEntryTerms`).
- When Astro's cache is enabled, pass content-query hints to `Astro.cache.set(cacheHint)`. Use the `WithCacheHint` variants for site settings, menus, taxonomies, and widget areas rendered by cached routes.
- Taxonomy names in queries must match the seed's `"name"` field exactly (e.g., `"category"` not `"categories"`).

## This Template

An unofficial mock Cloudflare-merch shop (fictional products, USD, Stripe sandbox) on top of the EmDash blog template: posts, pages, categories, tags, full-text search and RSS stay. Designed for personal writing, technical writing, indie newsletters, and anything where the writing is the product. Neutral editorial aesthetic: a framed layout with hairline rails, white cards on an off-white canvas, Inter with JetBrains Mono labels, and real article structure with bylines and reading time.

## Pages

| Page        | Path               | What it shows                                                                                                                  |
| ----------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Home        | `/`                | Merch storefront (hero with category pills, rails, spotlight, shop-the-look on a desk setup, FAQ); config in `src/features/home/config.ts`                  |
| All posts   | `/posts`           | Post rows with thumbnails, excerpts, bylines, and tag chips; cursor pagination                                                 |
| Post detail | `/posts/[slug]`    | Tags, title, excerpt, featured image, then a three-column reading view: meta rail, body, table of contents and sidebar widgets |
| Search      | `/search`          | Full-text search over posts; matching title terms are highlighted                                                              |
| Page        | `/pages/[slug]`    | Static page content (Portable Text)                                                                                            |
| Category    | `/category/[slug]` | Card grid of posts in a category                                                                                               |
| Tag         | `/tag/[slug]`      | Card grid of posts with a tag                                                                                                  |
| RSS         | `/rss.xml`         | Generated feed                                                                                                                 |

## Schema

- `posts` collection: `title`, `featured_image`, `content` (Portable Text), `excerpt` (text).
- `pages` collection: `title`, `content` (Portable Text). Used for `/about` etc.
- Taxonomies: `category`, `tag`.
- Single `primary` menu (Home, About, Posts by default).

Site settings have `title` and `tagline`. The title renders in the header, the home page intro, and the footer; the tagline renders under the title in the home page intro and in the footer.

## Visual character

Public chrome comes from `@emdash-commerce/design-system`: a flat wireframe in the Cloudflare palette (a warm charcoal
ink ramp plus an orange accent, system fonts, soft corners, 1px outlines, no shadow, gradient or motion, photos shown as shot), and the
header/footer/tab bar composed in `src/layouts/Base.astro`. Site name renders as a text wordmark (no
logo SVG). Shell copy is in `src/features/shell/copy.ts` (en / pl from `getSiteLocale()`).

Blog and article pages still use the legacy framed utilities (`.frame`, `.band`, `.intro`, `.btn`,
`.post-grid`) via `src/styles/blog-compat.css`, which aliases older `--color-*` tokens onto the shop
design system so existing routes keep rendering.

Storefront logic lives in `src/features/` (`catalog`, `cart`, `content`, `home`, `shell`); pages stay thin.
Commerce reads use `utils/commerce-fetch.ts` against `/_emdash/api/plugins/stripe-commerce/` (never
`catalog/product-legacy` on new code). Mini-cart: `MiniCartMount` + `GET /api/cart/summary?html=1` +
`features/cart/client/mini-cart.client.ts` on `cart:changed`. Shop-the-look kit checkout uses
`features/cart/client/look-cart.client.ts` (`setLookCartAdapter`, fresh cart via `credentials: omit`).

| Storefront page | Path            | Source |
| --------------- | --------------- | ------ |
| Home            | `/`             | `features/home/HomeView.astro`, `features/home/config.ts` (seeded catalog slugs; `load-config.ts` returns committed defaults); shop-the-look image and points and the spotlight image and callouts come from the `home` entry (`look_hotspots`, `spotlight_callouts`, read by `features/home/home-points.ts`) |
| Shop            | `/shop`         | `pages/shop/index.astro`, `features/catalog/domain/listing.ts` |
| Product         | `/shop/[slug]`  | `pages/shop/[slug].astro`, `features/catalog/components/ProductBuyBox.astro` |
| Cart            | `/cart`         | `pages/cart.astro` (plugin cart API) |
| Your order      | `/orders/view?token=` | `pages/orders/view.astro`, `features/orders/` (the signed link in the order emails; the plugin's `orders/view`; never cached or indexed, no referrer) |
| Category, brand | `/shop/c/[slug]`, `/shop/brand/[slug]` | the URL patterns the plugin gives those collections: 301 to `/shop?category=` / `?brand=`, a real 404 for an unknown slug |

## Image with points (`image-hotspots` plugin)

`home.look_hotspots` (mode `products`) and `home.spotlight_callouts` (mode `callouts`) are `json` fields edited with the
`image-hotspots:hotspots` widget from `packages/plugin-image-hotspots`. Value: `{ image, points[] }`, points in
percent. No image or no product point hides Shop-the-look; no titled callout renders the spotlight with the product image.
The widget is a React admin entry, so that plugin has no Block Kit panels; the `@emdash-cms/admin` alias in
`astro.config.mjs` must stay. Edits made in the admin are drafts: publish before checking `/`.

## Customisation

Re-skin the storefront in `packages/design-system/src/tokens/` (`index.css`, `fonts.css`) and
the chrome props in `Base.astro` — not by forking components. Blog-only tweaks can override tokens in
`blog-compat.css` or page-scoped styles. The old `src/styles/tokens.css` / `theme.css` pair is no
longer loaded on public pages.

## What not to do

- Don't edit shop routes or `packages/plugin-stripe` when changing chrome — keep chrome and commerce
  changes in separate PRs.
- Don't put copy inside design-system components; pass labels through `Base.astro` / shell helpers.
- Don't collapse the article three-column reading layout on desktop — it is unchanged in post templates.
- Comments stay on post detail; configure moderation or remove the UI and `commentsEnabled` together.
