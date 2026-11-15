# Changelog

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
