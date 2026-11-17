# AI guide: start here with an agent

This repo is built to be driven by an AI coding agent (Claude Code, Codex, Cursor). This page is the memo you give it, and
you: what the project is, how it is put together, what you can ask for, and ready-to-paste prompts. Everything on it is the
**actual state of the repo**; the deeper records live in `AGENTS.md`, `.ai/` and each package's docs.

> **What the demo shop is.** An unofficial **mock Cloudflare-merch store**: fictional products, generated art, USD prices,
> Stripe sandbox only. It is not affiliated with Cloudflare and nothing ships. The theme is data, so you can swap it for
> any other shop (see [Re-theme the catalog](#re-theme-the-catalog)).

## 1. The 60-second prompt

Open the repo in your agent and paste this. It reads the project, runs nothing, and reports back.

```text
You are in the emdash-commerce monorepo. Do not change anything yet.
1. Read AGENTS.md, .ai/README.md, .ai/memory/MEMORY.md and docs/ai-guide.md, then the memory files that match what you find.
2. Explain to me, in under 40 lines: what the project is, the four packages and how a request travels from the browser to
   Stripe and back (storefront -> plugin API -> EmDash content and storage -> Stripe -> webhook -> order).
3. List the commands I run most (dev, seed, bootstrap, doctor, lint, changeset, check:ai, typecheck, test, build) and what the validation gate is.
4. List the invariants I must not break (AGENTS.md "Invariants" and "Security").
5. Ask me what I want to build, and propose a plan before touching a file.
```

## 2. The map

```text
 browser ──► apps/storefront (Astro 7 SSR on EmDash, Node + SQLite, local uploads)
              │  pages are thin; logic in src/features/{catalog,cart,content,home,shell}
              │  all UI comes from ──► packages/design-system (tokens + props-driven Astro components)
              │  fields: image with points ──► packages/plugin-image-hotspots (React field widget)
              ▼
         /_emdash/api/plugins/stripe-commerce/…  ◄── packages/plugin-stripe (the commerce backend)
              │  catalog, carts, Checkout Sessions, orders, refunds, disputes, subscriptions,
              │  inventory, durable webhook pipeline, admin page, MCP tools
              ├──► EmDash content (collections in data.db: products, variants, prices, orders …)
              └──► Stripe (Products/Prices mirrored from the catalog, Checkout, webhooks)
```

| Folder | What it is | Read first |
| --- | --- | --- |
| `apps/storefront/` | The shop: routes, features, home composition, copy (en and pl), seed schema; Node or Cloudflare target | `apps/storefront/AGENTS.md`, `docs/cloudflare.md` |
| `packages/plugin-stripe/` | Backend-only plugin `stripe-commerce`, layered (`core` → `ports` → `services` → `adapters` → `plugin`) | `packages/plugin-stripe/docs/architecture.md`, `.ai/memory/emdash-plugin-stripe-extending.md`, `skills/extending-stripe-plugin/SKILL.md` |
| `packages/plugin-image-hotspots/` | The `image-hotspots:hotspots` field widget (shop-the-look points, callouts) | its `README.md`, `.ai/memory/emdash-react-field-widgets.md` |
| `packages/design-system/` | Tokens (Cloudflare orange on warm charcoal) and every visual component | its `README.md` (conventions, `token-lint`, `wireframe-lint`) |
| `scripts/` | `bootstrap`/`doctor` (setup), `seed-demo.mjs` + `lib/merch-catalog.mjs` (the mock catalog), `art/` (the product art generator) | the file headers |
| `skills/` | Commerce agent skills (wire plugin + storefront, extend plugin) | `skills/README.md` |
| `.ai/` and `CHANGELOG.md` | Decisions, memory (traps and lessons), run logs, history | `.ai/README.md` |
| `ROADMAP.md` | Labelled exception: forward-looking plan only (not actual state) | top of `ROADMAP.md` |

Facts that surprise people (each has a memory file):

- **EmDash keeps its schema in the database**, not in code. A collection or field made in the admin or over MCP exists only
  in `data.db`; mirror it in `apps/storefront/seed/seed.json` and regenerate the types.
- **Nothing CMS-driven is prerendered.** Every content route is server-rendered.
- **The amounts of a cart are derived on the server.** The browser sends price ids and quantities only.
- **The plugin never writes the `products` collection** (a draft would be staged); Stripe ids live in plugin storage.
- **A resync queues, it does not sync.** The seed drives the catalog sync to the end itself.
- Plugin ids `stripe-commerce` and `image-hotspots` and the widget ref `image-hotspots:hotspots` are stored in content: never rename.

## 3. What you can ask for

| Area | What exists today |
| --- | --- |
| Catalog | Products with variants (size x colour grid), per-variant price, image and stock; brands; categories with a parent; product types with specification attributes; bundles as fixed-price products; one-off and recurring prices (membership with a trial) |
| Storefront | Home (hero, rails, spotlight, shop-the-look, FAQ), shop with filters and sorting, product page, design-system **cart** and **checkout success**, mini-cart, **guest order view** (`/orders/view`) and **lookup** (`/orders/lookup`), category/brand URLs, search, blog (posts, tags, RSS), en and pl copy, Cloudflare target (`docs/cloudflare.md`) |
| Shop the look | A photo with numbered points; each point opens a product, and one dialog adds the whole kit to the cart |
| Checkout | Stripe-hosted Checkout from a server-priced cart; success and cancel pages; sold-out and low-stock states; stock reservation while a checkout is open |
| Orders | Paid orders from the webhook (exactly once), refunds, disputes, fulfilment status, timeline, guest order links (emailed signed link, page at `/orders/view`) |
| Operations | Admin "Commerce" page (key and webhook health, resync, reconcile, abandoned-checkout cleanup), and MCP tools for an agent: `commerce_status`, `commerce_catalog_sync`, `commerce_orders_list`, `commerce_inventory_adjust`, `commerce_orders_refund`, `commerce_checkouts_sweep`, `commerce_reconcile`, `commerce_webhooks_*` and more |
| Design system | Tokens, atoms to sections, lints that fail on a raw colour, a shadow or a gradient, a contrast test of the token pairs |
| Releases | Changesets (`pnpm changeset`), publish workflow — `docs/releasing.md` (packages not on npm until scope exists) |
| Quality | oxlint (`pnpm lint`), Vitest across packages; `data-testid` hooks on cart, checkout success and order lookup (no Playwright suite in CI yet) |

Not built (say so when you ask for it, the agent will plan it as new work): shipping rates and tax rules beyond the plugin
options, discount codes beyond Stripe promotion codes, customer accounts, digital downloads, a real multi-currency cart,
Playwright e2e for Cloudflare, one-click Deploy button for this monorepo without a standalone copy or published packages.

## 4. Prompts

Every prompt below assumes you also paste the guardrails.

**Guardrails (append to any prompt):**

```text
Rules: Stripe sandbox keys only, never print a secret, never touch a production database or host. Do not commit or push
unless I ask. Follow AGENTS.md (Conventional Commits, files under 600 lines, strict TypeScript, tests with the change).
Add a CHANGELOG.md entry; a UI change also updates packages/design-system/CHANGELOG.md; a decision goes to
.ai/decisions/, a trap to .ai/memory/. Before you call it done run pnpm check:ai, pnpm lint, pnpm typecheck, pnpm test and pnpm build, and run the
feature for real (dev server, curl, browser). Tell me what you verified and what you did not.
```

### Set it up on my machine

```text
Get this clone running. Use `pnpm doctor` to see what is missing, then `pnpm bootstrap`. Start the dev server, run
`pnpm seed`, restart the server once after the first seed, and open /shop. Stop and tell me exactly what you need from me
(for example my Stripe sandbox key) instead of guessing. Do not paste secrets into the chat.
```

### Add a product, a category or a bundle

```text
Add a product "<name>" to the demo catalog: <price in USD>, <variants or none>, category <slug>, brand <slug>. Edit
scripts/lib/merch-catalog.mjs (the data), add its art to scripts/art/manifest.mjs and run `pnpm art`, then `pnpm seed -- --only
apparel,accessory,bundle` against the running dev server. A bundle is a fixed-price product with an "includes" line, and its description states the saving as "$X instead of $Y" (the product page shows exactly that phrase as a chip; a test keeps the data to it). Check
/shop and the product page in the browser.
```

### Re-theme the catalog

```text
Turn this demo shop into <theme, e.g. "a coffee roaster's merch store">. Keep it fictional and say so in the FAQ and footer
copy. Follow docs/ai-guide.md "Re-theme the catalog" step by step, show me the product list and the colour palette before
you generate art, and verify the home page in the browser at the end.
```

Checklist the agent follows:

1. **Data:** `scripts/lib/merch-catalog.mjs` (brands, categories, products, bundles, membership, home CTA and look) and
   `CURRENCY`; the plugin currency in `apps/storefront/astro.config.mjs` and `DEFAULT_CURRENCY` in `src/lib/money.ts`.
2. **Art:** the drawing code in `scripts/art/` (palette, shapes, manifest, hotspots), then `pnpm art`. EmDash rejects SVG
   uploads, so the output is PNG, committed in `apps/storefront/public/merch/`.
3. **Home:** `apps/storefront/src/features/home/config.ts` (category slugs of rails, tabs and the index, hero and spotlight
   products) and `copy.ts` (en and pl); `HomeView.astro` renders a rail per key.
4. **Words:** `features/content/copy.ts`, `features/shell/copy.ts`, the site title and tagline (`seed/seed.json` settings,
   `SITE` in the catalog, `utils/site-identity.ts`), the About page and footer widget in `seed/seed.json`.
5. **Colours:** `packages/design-system/src/tokens/index.css`, then `pnpm nx test design-system` (lint and contrast test).
6. **Docs:** README, `docs/getting-started.md`, an ADR in `.ai/decisions/`, changelogs.
7. **Reset and prove it:** delete `apps/storefront/data.db*` and `uploads/`, `pnpm dev`, `pnpm seed`, open the pages.

### Change the colours or the look

```text
Re-skin the design system to <palette>. Only packages/design-system/src/tokens/ changes unless a component hard-codes a
colour. Keep every text/background pair at 4.5:1 and every control border at 3:1 (the test in
packages/design-system/scripts/token-contrast.test.mjs proves it; add pairs for any new token). Update the hue rule in
scripts/wireframe-lint.mjs to the new palette, then run pnpm nx test design-system and look at the home page and a product page.
```

### Add a design-system component

```text
Add a <name> component to packages/design-system: props-driven, no copy inside the component, tokens only (token-lint and
wireframe-lint must stay green), a types.ts, and use it from the storefront by passing data in. Record it in
packages/design-system/CHANGELOG.md. A missing component is added to the design system, never written as markup in the app.
```

### Extend the Stripe plugin

```text
I want <behaviour> when <event>, e.g. "send a Slack message when an order is paid". Read
packages/plugin-stripe/docs/extending.md and .ai/memory/emdash-plugin-stripe-extending.md first, choose the smallest
extension seam (a site extension subscriber if it needs no change to the package), write the test first, and keep the
layer rule (core -> ports -> services -> adapters -> plugin).
```

### Change the schema

```text
Add the field/collection <...>. Remember the schema lives in data.db: apply it through the dev setup or MCP, mirror it in
apps/storefront/seed/seed.json, regenerate types (npx emdash types), and read
.ai/memory/emdash-schema-lives-in-the-database.md and .ai/decisions/2026-11-12-emdash-agent-schema-changes-over-mcp.md first.
```

### Review and ship

```text
Review my branch against main: run the gate (pnpm check:ai, lint, typecheck, test, build), read the diff for correctness,
security (input validation at the boundary, secrets, amounts derived on the server) and missing tests, and tell me blockers
first. Then write the PR description: what changed and why, how it was verified, what is not covered.
```

### Deploy on Cloudflare

```text
I want this storefront on Cloudflare Workers. Read docs/cloudflare.md and .ai/decisions/2026-11-17-cloudflare-target-switch.md.
Do not promise the Deploy button works for this monorepo (workspace:* siblings). Walk me through local workerd first
(dev:cloudflare on a non-4360 port), seed with EMDASH_URL, restart after first seed, stripe listen, then build:cloudflare
and what wrangler secrets I must set myself. Never log in to my account or print secrets. Say what you verified vs what
needs a real Cloudflare account.
```

### Prepare a release

```text
Prepare a release of @emdash-commerce packages. Read docs/releasing.md and .changesets/README.md. List what is pending
(pnpm changeset status), whether the npm scope and NPM_TOKEN exist (they may not — say so), and what the Version Packages
PR would bump. Do not run changeset version or publish unless I ask. Update package changelogs only through the Changesets
workflow, not by hand, except as releasing.md describes for the first merge.
```

## 5. Working with the dev server and the agent

- `pnpm dev` starts the storefront on port 4360. Astro 7 detaches it in agent shells; manage it with `npx astro dev status`,
  `logs` and `stop` inside `apps/storefront`.
- Do not run `pnpm build` while the dev server runs and expect the admin to survive: the build overwrites the dev server's
  Vite cache (`.ai/memory/emdash-dev-and-build-share-vite-cache.md`). Restart the server after the gate.
- The editing pill (X-ray, Inspect, Notes with "copy prompt") in the dev server lets you point at an element and hand the
  agent a prompt that names the component and the field: `.ai/memory/emdash-editor-bar-dev-tools.md`.
- The EmDash docs are an MCP server at `https://docs.emdashcms.com/mcp`; the storefront ships `.mcp.json` for it.

## 6. Glossary

| Term | Meaning |
| --- | --- |
| EmDash | The Astro-based CMS this site runs on: collections, admin, media, plugins |
| Collection | A content type (products, orders, posts…); its fields live in the database |
| Plugin | `stripe-commerce` (backend) and `image-hotspots` (admin field widget), registered in `astro.config.mjs` |
| Variant | One size x colour combination of a product, with its own SKU, price and stock |
| Bundle | A fixed-price product whose "Includes" specification lists its parts |
| Look (shop the look) | A photo with points, each linked to a product; one dialog adds the kit to the cart |
| Rail | A horizontal row of product cards on the home page, driven by a category slug |
| Gate | `pnpm check:ai`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` |
