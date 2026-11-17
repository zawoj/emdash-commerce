# Changelog

## 2026-11-17 (README roadmap)

### docs: README section "Limitations (honest)" becomes "Roadmap" — Claude Code
- The README now has a **Roadmap** section that points to `ROADMAP.md` (the only place for plans) and names what is next,
  with a call for contributions. The factual list of limits stays under it as **Limits today**, unchanged.
- Why: a release announcement should lead with where the project is going, not with a list of gaps; the limits are still
  stated, one level down.

## 2026-11-17 (release screenshots)

### docs: release screenshots in `docs/screenshots/release/` — Claude Code
- Added 14 PNG screenshots of the running demo for the README and release announcements: storefront (home, shop, category,
  product with variants, bundle, cart, full home page), a real Stripe-sandbox checkout and the guest order page opened from
  the emailed link, two mobile views, and the admin (shop-the-look hotspots widget, product editor, Commerce dashboard).
- Taken against the local dev server with Playwright; the Stripe key tail on the Commerce dashboard is masked and all
  e-mail addresses are `@example.com`. The earlier set in `docs/screenshots/` is unchanged and still used by the README.
- Not covered: the README is not yet linked to the new images.

## 2026-11-17 (community release)

### feat: community repo conventions, release mechanics, Cloudflare target, rebuilt storefront pages, e2e tests — Claude Code, Cursor
One pull request assembled from parallel agent streams (each in its own worktree, merged into one branch). Positioning and
scope: `.ai/decisions/2026-11-17-community-release-scope.md`.
- **Community repo conventions.** `SECURITY.md` (private advisories only), `CONTRIBUTING.md` (paths, gates, our AI policy),
  Contributor Covenant 2.1, PR and issue templates, `CODEOWNERS`, Dependabot, oxlint (`pnpm lint`, no repo-wide formatter, 0 errors)
  and `.editorconfig`; CI pins third-party actions to commit SHAs, runs lint, and adds CodeQL and zizmor. Why: match what EmDash and
  `cloudflare/*` repositories ship, without policies we do not run (no CLA). ADR `community-repo-conventions`.
- **Release mechanics.** Changesets with `changelog-github`, the three packages (`plugin-stripe`, `plugin-image-hotspots`,
  `design-system`) made publishable (metadata, provenance, a `files` allow-list that ships TypeScript source like EmDash's own
  plugins, peer dependencies), `PLUGIN_VERSION` read from `package.json`, a release workflow and `docs/releasing.md`. Tarballs
  verified with `pnpm pack`, `publint --strict`, an install into a clean project and an EmDash site build. Nothing is published.
  No `emdash-plugin.jsonc`: both plugins are native and the registry takes sandboxed plugins only. Outside the code: create the
  npm organisation `@emdash-commerce`, add `NPM_TOKEN`, enable "Allow GitHub Actions to create and approve pull requests".
- **Cloudflare target.** `DEPLOY_TARGET=cloudflare` runs the same storefront on Workers + D1 + R2 (`wrangler.jsonc`,
  `src/worker.ts`, `*:cloudflare` scripts); Node + SQLite stays the default. Verified on workerd without a Cloudflare account:
  build, `wrangler deploy --dry-run`, seed, a sandbox purchase with a signed webhook, and the cron task. The Stripe plugin needed
  no code change; `workers-compat.test.ts` keeps it free of Node-only APIs. `docs/cloudflare.md`. **The Deploy to Cloudflare
  button cannot build this monorepo** (the app depends on `workspace:*` packages and the button needs an isolated subdirectory).
  A deployed site needs an email provider, the Workers Paid plan is the safe choice, and `pnpm seed` cannot seed a deployed site
  (it uses the dev login).
- **Workflow hardening after the first zizmor run.** Every `actions/checkout` sets `persist-credentials: false` (no job pushes), and
  Dependabot has a 7-day `cooldown` for both ecosystems.
- **Storefront pages.** `/cart` and `/checkout/success` rebuilt on design-system components with en and pl copy; new
  `/orders/lookup` (and `POST /api/orders/access-link`) so a guest can ask for a new order link without learning whether an order
  exists; `/orders/view` links to it when a link is invalid. Stable `data-testid` hooks for the e2e suite. Design system: cart
  line, order summary rows and order confirmation take test ids (see its changelog).
- **End-to-end tests.** A Playwright suite: `pnpm test:e2e:smoke` needs no secrets and runs in CI on every PR (40 tests: pages,
  routes, filters, cart, order pages and their headers, axe at desktop and phone viewports); `pnpm test:e2e` adds a real
  Stripe-sandbox purchase (hosted Checkout, webhook, success page, emailed link, order page), run weekly and on demand. It uses its
  own dev server on port 4380 and a throwaway database in `.e2e/` (`EMDASH_DATABASE_FILE` and `EMDASH_UPLOADS_DIR` move the
  storefront's SQLite file and uploads; defaults unchanged). 25 source mutations were each caught. Bugs it found and fixed: the
  order-link API answered 400 to every JSON request (the lookup form never worked with JavaScript), the lookup notice hooks never
  reached the DOM, and the phone back link did not name its target. Four colour-contrast cases are `test.fixme` (reduced-opacity
  states in the design system). Outside the code: add the repository secret `STRIPE_SANDBOX_SECRET_KEY` for the weekly purchase
  job; Stripe CLI 1.55.11 refused a bare `stripe listen --forward-to ...` and needed `--all-snapshot` (1.40.3 starts without it;
  `docs/getting-started.md` has a troubleshooting row, the quickstart still shows the bare command). `docs/testing.md`.
- **Docs and agent skills.** README restructured in EmDash's style (community notice, features verified against the code, Mermaid
  flow, packages marked "once published", honest limitations), `ROADMAP.md` as the one labelled place for plans, agent skills
  `skills/building-commerce-site` and `skills/extending-stripe-plugin` in EmDash's format (linked from the storefront's
  `.agents/skills`), refreshed `AGENTS.md` and `docs/ai-guide.md` (Cloudflare and release prompts), and the dev order-link
  walkthrough (`/_emdash/api/dev/emails`, `/orders/lookup`) in `docs/getting-started.md`.
- **Not covered by this PR.** Nothing is published to npm; the Cloudflare target was not deployed to a real account and has no
  Playwright coverage; order emails were only seen through EmDash's dev console provider; the demo still wears the Cloudflare-merch
  name and palette (owner's decision, see the scope ADR).

## 2026-11-17 (release readiness)

### fix: encryption key format, guest order page, category and brand URLs, docs that matched the code — Claude Code
- **Encryption key (a real onboarding bug).** EmDash 1.5 accepts only `emdash_enc_v1_` + 43 base64url characters, but
  `pnpm bootstrap` generated a 64-character hex key, `pnpm doctor` demanded one and `.env.example`, the getting-started guide
  and the plugin README said `openssl rand -hex 32`. A fresh clone therefore got a key EmDash rejects: the maintenance cron
  failed and every route that reads the access-token secret (`orders/view`, the access-link email) answered 500. Bootstrap now
  generates the right format, doctor checks it (a comma-separated rotation list is accepted), the old placeholder still counts
  as a placeholder, docs say `npx emdash secrets generate`, and `.ai/memory/emdash-encryption-key-format.md` records the trap
  (including: never swap the key on a database that already stored a secret).
- **`/orders/view`.** The signed link in the order emails (the plugin's default `emails.orderViewPath`) led to a 404. The page
  now shows the order number, payment and fulfilment status, a progress track, lines and totals from the plugin's `orders/view`
  (`features/orders/`, en and pl). A bad or expired link is a 404 page with a way back to the shop, an unreachable plugin a 503;
  the page is `no-store`, `noindex` and sends no referrer because the token is a bearer secret.
- **`/shop/c/<slug>` and `/shop/brand/<slug>`.** The plugin declares these URL patterns for categories and brands (search results
  and sitemaps use them) but the storefront had no route: both were 404. A known slug is now a 301 to `/shop?category=` /
  `?brand=`, an unknown one a real 404. `missing-routes.test.ts` now allows a redirect only after the 404 rewrite and requires
  both routes.
- **Docs that disagreed with the code.** The plugin README counted 17 MCP tools and listed 15; there are 19 (`commerce_catalog_sync`
  and `commerce_checkouts_sweep` are now in the table). The README says what the demo shop leaves off (promotion codes, shipping
  rates, Stripe Tax, embedded Checkout), that the language is one per deployment, and that the design system holds components
  the demo does not use. `apps/storefront/AGENTS.md` said "square corners" and now lists the new routes.
- **Design system.** `OrderSummary` drops its empty thumbnail column when no line has a photo (see its changelog).
- **Tests.** The order view-model (statuses, rows, UTC date, variant text, Polish), the key format and generator, and the route
  rule are tested. `pnpm check:ai`, typecheck and test pass; the happy path of `/orders/view` with a real token was not driven
  through a real Stripe payment (the hosted page could not be automated), only rendered from a fixture and probed for bad tokens.
- **Not changed.** `checkout/success` and `cart` still use legacy markup with English copy. A guest cannot ask for a new order
  link from the storefront (the plugin's `orders/access-link` has no page). No Cloudflare (Workers, D1, R2) variant of the
  storefront exists yet.

## 2026-11-16 (review fixes)

### fix: the shop UI refresh, after a code review — Claude Code
- **Add to cart.** The button went back to the label it read from its own text at click time, so a second click inside the
  "Added" window on a slow connection left it on "Added" for good. The form now carries `data-label-idle` and
  `data-is-purchasable` (rendered by `AddToCartForm`, kept current by `product-buy.client.ts` when the variant changes) and the
  script returns to those, with one feedback timer cleared on every click. A variant that became sold out while the request
  ran also keeps the button disabled, as it did before the request, instead of being re-enabled.
- **Filters.** A category in the URL that no product belongs to (a stale bookmark) shows the whole shop instead of an empty page
  whose "Clear all filters" led back to itself (`withKnownCategory`). A catalog API failure shows "We could not load the
  products" with "Try again" and answers 503, instead of "No products match these filters". A catalog that reaches the 200
  product fetch limit says "Showing the first 200 products." and logs a warning.
- **Product page.** A sold-out product no longer promises a delivery date. The bundle saving chip reads the two amounts around
  "instead of" / "zamiast" ("$109 instead of $147") instead of copying the sentence; the catalog data and its test keep that
  wording (`docs/ai-guide.md`).
- **Cart.** The cart summary fell back to PLN for a missing subtotal currency; it now uses the shop currency.
- **Design system.** `ActivityIndex` and `BrandMarquee`, unused since the home redesign, are removed; the icon names have a
  `@emdash-commerce/design-system/icon-names` export instead of a deep import path.
- **Tests.** The dialog and category-bar scripts of the design system are tested (`listing-dialog.client.test.ts`: open and
  close, reset of unapplied choices, backdrop, blank values, bare path, auto-submit sort, centring the current pill), the cart
  button has regression tests for the double click, a failed second click, a variant that sells out meanwhile and the label
  set by the variant script, and the catalog test checks that every bundle's wording reaches the product page and that every
  home link points at an existing category. Each new test was shown to fail against the bug it guards.
- **Not changed.** Filtering still happens in the page, so the shop suits a few hundred products (the limit is now visible, not
  fixed). The bundle saving is still read from the description, not a structured field. `CollectionBento`, `ProductGrid` and
  `CategoryTile` are also unused by the storefront and stay in the design system.

## 2026-11-16 (README)

### docs: README features list and screenshots — Claude Code
- The README gains a **Features** list (storefront, commerce backend, admin, design system, agent tooling) and a
  **Screenshots** section: home, shop, the filter drawer, a product page, a bundle, shop the look, the image-hotspots widget in
  the admin, and a phone strip. The PNGs are in `docs/screenshots/` (about 1.1 MB), 1440 x 900, light theme, taken from the seeded
  mock shop with headless Chrome while logged out (a logged-in session shows the EmDash editing pill). They are static: retake
  them when the UI changes.
- The packages table no longer calls the design system "square".

## 2026-11-15 (storefront UI refresh)

### feat: a simpler, softer storefront: category bar, filter dialog with live counts, calmer product page and home — Claude Code
- **Why.** The listing worked but read as a form (an open accordion pushed the products ~600 px down, huge empty price
  boxes, no category links, applied filters never shown, brand held one value), and the product page and home were boxed and
  uneven. The design follows the owner's Notion UX notes (see `.ai/decisions/2026-11-15-soft-corners-and-dialog-filters.md`).
- **Shop.** A compact head with the product count, a category bar, one toolbar (Filters button with a badge, removable
  filter chips, sort). Filters open in a dialog (drawer from 768 px, full-screen sheet on a phone): in stock, size, brand
  (now multi-select, was one value) and price presets, each option with its result count, and a "Show N results" button
  that updates live. Without JavaScript the panel is an inline GET form. The empty result lists the applied filters. The
  product count is pluralised ("1 product"). New URL parameters: `category`, repeated `brand` and `size`, `price=min-max`;
  `priceMin` and `priceMax` still work. `/shop` fetches the whole catalog and filters in the page (`domain/facets.ts`), so
  it suits a few hundred products, not thousands.
- **Product page.** Gallery with a peek of the next photo, the strongest promises (delivery with a date range, 30-day returns,
  secure payment) beside the CTA, accordions for Description, Specification and Shipping and returns, a bundle's "Includes"
  list with the saving, an "Adding… / Added" button, a sold-out notice with a link to similar products, and the phone
  bar appears once the button scrolls out of view.
- **Home.** One hero (one primary CTA, a quiet "Shop bundles" link, category pills under it) replaces the four-tile board;
  rails are New arrivals, Sale and Bundles with one head style; the CTA band, newsletter field and FAQ are borderless tiles.
- **Look.** Corners are soft (see the design-system changelog). The lint rule that required square corners is relaxed.
- **Outside the code.** Restart the dev server after pulling (the new client scripts add dependencies Vite must
  re-optimise; `/cart` showed a 504 for `zod` until it did).
- **Not covered.** Real iOS Safari (safe areas, keyboard), screen-reader output, dark surface, the Polish copy in a browser,
  scroll position after applying filters (the page returns to the top), a mutation pass over the product page tests.

## 2026-11-15 (Cloudflare merch theme)

### feat: the demo shop is mock Cloudflare merch, with an orange skin, USD and generated art — Claude Code
- **Catalog.** The sportswear demo is replaced by fictional, unofficial Cloudflare-style merch, as data in
  `scripts/lib/merch-catalog.mjs`: three labels, eight categories (apparel with a "Hoodies & jackets" child, desk setup,
  drinkware, stickers & pins, bundles, new arrivals, sale), five variant products (size x colour), twelve simple products
  (one low on stock, one sold out), two fixed-price bundles (a Desk Setup Bundle and a New Hire Welcome Kit, with a new
  "Bundle" product type and an "Includes" specification) and an Edge Club membership with a recurring price. A test checks
  that the data, the home config and the art agree, and that every bundle costs less than its parts and says so.
- **Home page.** Rails, tabs and the category index are now Apparel, Desk setup, Drinkware and Bundles (a new Bundles rail);
  shop-the-look is a desk setup (lamp, mat, mug, cable kit, keycaps) whose kit adds to the cart in one dialog; the spotlight
  is the Packet Windbreaker with callouts. Copy in en and pl, including an FAQ answer that says this is an unofficial demo.
- **Art.** `scripts/art/` (`pnpm art`) draws the product, scene and category art as flat vector shapes (no text) and
  rasterises it with `sharp` to PNG in `apps/storefront/public/merch/`, committed, so the seed needs no network. PNG, not
  SVG, because EmDash's media upload rejects SVG (`.ai/memory/emdash-media-upload-rejects-svg.md`). `sharp` is a root
  devDependency for it. Hotspot positions are computed from the same drawing coordinates (`scripts/art/hotspots.mjs`).
- **Currency.** Prices are USD: `DEFAULT_CURRENCY`, the plugin options in `apps/storefront/astro.config.mjs`
  (`defaultCurrency` and `supportedCurrencies` `usd`) and the price filter unit (`currencySymbolOf`, was a literal "zł").
  **A database made before this change keeps a PLN-only currency select on prices: reset it** (`docs/getting-started.md` §8).
- **Seed.** `scripts/seed-demo.mjs` reads the catalog module and the committed art (no Unsplash), gains `--only bundle`, and
  `seed.json` drops its two Unsplash `$media` fields and takes the new title, tagline, About and footer text.
- **Onboarding.** `pnpm bootstrap` prepares `apps/storefront/.env` (generates the encryption key, takes a sandbox Stripe
  key from the environment or a prompt, reads the webhook secret from the Stripe CLI, refuses a live key, never prints a
  secret) and `pnpm doctor` re-checks the toolchain, `.env`, dev server and seeded catalog without changing anything
  (`pnpm init` and `pnpm setup` are pnpm built-ins, hence the names). `docs/ai-guide.md` is the memo for an AI agent and a
  newcomer: architecture map, what exists, ready prompts per job and the "Re-theme the catalog" checklist; the README opens
  with a paste-in prompt and the disclaimer that this is not affiliated with Cloudflare.
- **Skin.** Cloudflare orange on warm charcoal in `packages/design-system` (see its changelog and
  `.ai/decisions/2026-11-15-cloudflare-merch-theme.md`).
- To do outside the code: nothing. Existing Stripe sandbox products from the sportswear seed stay in the sandbox; archive
  them in the dashboard or use a fresh sandbox.

## 2026-11-15 (QA fixes, round 2)

### docs: getting started from zero — Claude Code
- New `docs/getting-started.md`, linked from the top of `README.md` and from `AGENTS.md`: prerequisites (Node, pnpm,
  Stripe CLI), Stripe sandbox keys with the restricted-key permissions, every environment variable, the per-CLI-login
  webhook secret and how a mismatch shows (`[400]` in `stripe listen`), running and stopping the detached dev server,
  what `pnpm seed` creates (idempotent, `--only`, the automatic Stripe sync), the dev login, a first test purchase with
  card 4242 and where the order appears, a reset to a clean state, and troubleshooting drawn from `.ai/memory/`.
- The README quickstart is shortened to point there; `apps/storefront/.env.example` explains each variable.

### fix: a variant name is never prefixed with the product name twice — Claude Code
- A variant title is derived as `<product> — <options>`, and the catalog sync, the cart line, the emails, the admin
  low-stock list and the subscription items all prefixed the product title again, so Stripe Checkout and the cart read
  "Velocity Shell Jacket — Velocity Shell Jacket — XL / Red". `variantDisplayNameOf` and `variantOptionsLabelOf`
  (`core/catalog-rules.ts`, exported from `/contracts`) now compose every display name and the Stripe Product name; a
  hand-typed title without the prefix still gets it. The stored order line snapshot is unchanged (title and the
  variant title as it was). Existing Stripe products are renamed by the next catalog resync.

### fix: "Sold out" text only on option chips that are sold out — Claude Code
- Every option chip carried a visually hidden "Sold out" note, toggled with the `hidden` attribute, so the text content
  of an in-stock chip (and anything reading it) included it. The note is now added and removed with the state
  (`setSoldOutNote`, used by the server render and by `syncVariantChips`, so the product page and the kit dialog
  agree): the accessible name is "XL" in stock and "XL, sold out" otherwise.

### fix: unknown product slug answers 404 — Claude Code
- `/shop/<missing>` answered a 302 to `/shop`, so a mistyped or deleted product looked like a live page to crawlers and
  shoppers. It now rewrites to the site's 404 page (`Astro.rewrite("/404")`, status 404), like every other dynamic
  content route. A test scans all dynamic pages so a new one cannot redirect on a miss.

### fix: the checkout sweep also takes sessions Stripe closed early — Claude Code
- Live check of the sweep: a session expired through the Stripe API is released by its webhook but its stored expiry is
  still in the future, so the first version of the sweep (time based) kept its snapshot and cart for the full session
  lifetime. A snapshot now ends at its stored `expiresAt`, and with `retentionHours: 0` a session the provider reports
  as closed counts as ended; a still-open session is never touched early. Released reservation records are purged by
  their release time (`updatedAt`) instead of the hold's expiry.
- A checkout whose creation failed (for example `NOT_CONFIGURED` on a fresh database) leaves a snapshot with no session
  after releasing its hold; the sweep removes such a snapshot ten minutes after it was written.
- The admin `carts` mirror of a cart the sweep deletes is set to `expired` first (it stayed `checkout_open` for good), and
  a reopened cart's mirror is refreshed.

### feat: sweep of abandoned checkouts — Claude Code
- Verified with a sandbox session expired through the Stripe API: `checkout.session.expired` arrives through
  `stripe listen`, answers 200, releases the reservation and puts the cart back to `active`. What stayed behind were
  the records themselves (checkout snapshot, released reservation, a cart nobody returned to), and nothing ever
  removed a snapshot or a released reservation.
- New maintenance step `checkout-sweep` (every five minutes, with the existing cron task), plus the admin button
  "Clean up abandoned checkouts" on the Commerce page and the route/MCP tool `admin/checkouts/sweep` /
  `commerce_checkouts_sweep` (`retentionHours` override). Once a session ended and
  `checkout.abandonedRetentionHours` (new option, default 48) passed, with no order for the session, it closes a
  still-open session, releases a still-held reservation, deletes the snapshot, the released reservation record and an
  anonymous idle cart (a cart with an email is only reopened). A `complete` session is left to settlement; paid
  orders and their reservations are never touched. New store methods (`CheckoutSnapshotStore.listCreatedBefore` /
  `delete`, `InventoryStore.purgeReleasedReservations`) and a `createdAt` index on `checkout_snapshots`.

### fix: checkout with an empty cart returns to the cart instead of a bare 502 — Claude Code
- `/api/cart/checkout` answered every failure, including "no cart" (404) and "cart not checkout-ready" (409), with a
  plain-text 502 "Checkout unavailable". It now redirects (303) to `/cart?checkout=<notice>` for a failure the shopper
  can act on (empty or missing cart, items changed or out of stock, rate limit) and the cart page shows the message in
  its alert area and cleans the URL. The notice values are a fixed list, so the query string cannot inject text. A 502
  stays for a genuine provider or server failure (`PROVIDER_ERROR`, `NOT_CONFIGURED`, `INTERNAL`).

### fix: `pnpm seed` syncs the catalog to Stripe itself — Claude Code
- The seed publishes products before anything syncs them, so the first checkout needed a manual "Resync catalog". It now
  ends by queuing the plugin's resync and driving it to the end (`scripts/lib/sync-stripe-catalog.mjs`): with a sandbox
  key configured it repeats the new `admin/catalog/sync` call (a batch of due syncs per call; MCP
  `commerce_catalog_sync`) until nothing is due, with a timeout (`SEED_SYNC_TIMEOUT_SECONDS`, default 300) and a clear
  message on timeout or failed links. Without a key it prints what to run later; with a live key it does nothing.
- Why a new route: the maintenance task syncs only 25 links every five minutes, which is about 40 minutes for the demo
  catalog.

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
