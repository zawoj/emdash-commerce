# emdash-commerce

Commerce for [EmDash](https://github.com/emdash-cms/emdash) (the Astro-based CMS): a Stripe plugin, an image-with-points
field widget, a sportswear design system, and a demo storefront that uses all three. One Nx + pnpm monorepo.

| Path | Package | What |
|---|---|---|
| `apps/storefront` | `@emdash-commerce/storefront` | The demo shop: Astro 7 SSR on EmDash (Node + SQLite + local uploads). Home, shop, product page, cart, Stripe Checkout. |
| `packages/plugin-stripe` | `@emdash-commerce/plugin-stripe` | Backend-only commerce plugin (id `stripe-commerce`): catalog with variants and prices mirrored to Stripe, carts, Checkout Sessions, orders, refunds, disputes, subscriptions, a durable webhook pipeline. [README](packages/plugin-stripe/README.md) |
| `packages/plugin-image-hotspots` | `@emdash-commerce/plugin-image-hotspots` | React field widget `image-hotspots:hotspots`: an image with points (a product per point, or a title and text). [README](packages/plugin-image-hotspots/README.md) |
| `packages/design-system` | `@emdash-commerce/design-system` | Tokens and props-driven Astro components (volt sportswear skin, no brand assets). [README](packages/design-system/README.md) |

Plugin ids (`stripe-commerce`, `image-hotspots`) and the widget reference (`image-hotspots:hotspots`) are stored in content
and schema, so they are part of the contract.

## Quickstart

You need **Node >= 24.22.1** (see `.node-version`) and **pnpm 10** (`corepack enable` picks the version from `package.json`).

```bash
pnpm install
cp apps/storefront/.env.example apps/storefront/.env
```

Edit `apps/storefront/.env`:

- `EMDASH_ENCRYPTION_KEY`: `openssl rand -hex 32`.
- `STRIPE_SECRET_KEY`: a **sandbox** key (`sk_test_...` or a restricted `rk_test_...`) from the Stripe dashboard in
  test mode. Never use a live key for local work.
- `STRIPE_WEBHOOK_SECRET`: the `whsec_...` printed by `stripe listen` (below).

Start the storefront (port **4360**) and, in a second terminal, forward Stripe sandbox webhooks to it:

```bash
pnpm dev
stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook
```

The site is at <http://localhost:4360>. The admin is at `/_emdash/admin`; on localhost there is a dev login that needs no
passkey: open `http://localhost:4360/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin` once (a fresh database is set up
by it), and later `http://localhost:4360/_emdash/api/auth/dev-bypass`.

### Fresh clone: schema and content from an empty database

EmDash keeps its schema (collections and fields) and content in the database, not in the repo
(`.ai/memory/emdash-schema-lives-in-the-database.md`). Two things fill an empty `apps/storefront/data.db`:

1. **The schema and the blog and Homepage seed.** `apps/storefront/seed/seed.json` defines the blog collections (`posts`,
   `pages`, `home`, `feedback`), taxonomies, menus and sample content. It is applied by the setup flow: the dev login above
   (`/_emdash/api/setup/dev-bypass`, or the setup wizard at `/_emdash/admin/setup`) runs it. The commerce collections
   (products, variants, prices, orders, ...) are created by the `stripe-commerce` plugin itself when the dev server starts.
2. **The demo catalog and Homepage fields.** With the dev server running:

   ```bash
   pnpm seed
   ```

   `scripts/seed-demo.mjs` (dependency-free, idempotent: matched by slug or name, safe to re-run) creates the attributes,
   product types, brands, categories, nine apparel products with variants and prices, four accessories, a membership with
   a recurring price, and fills the Homepage entry: the CTA band with the cyclists photo, the shop-the-look points and the
   spotlight callouts. If the schema is missing it runs the dev setup first. `EMDASH_URL` points it at another port
   (default `http://localhost:4360`). Photos are Unsplash images named by photo id; each is downloaded on demand into the
   git-ignored `.cache/unsplash/` and uploaded to the media library. No image is committed.

Reset by stopping the server and deleting `apps/storefront/data.db*` and `apps/storefront/uploads/`.

### Try a purchase

Products reach Stripe when they are published with a key configured. The seed publishes before that, so after setting
`STRIPE_SECRET_KEY` open **Commerce** in the admin and resync the catalog (or call the `commerce_catalog_resync` MCP tool).
Then open <http://localhost:4360/shop>, add a product, check out, and pay with the Stripe test card `4242 4242 4242 4242` (any
future expiry and CVC). With `stripe listen` running the order appears under Commerce in the admin.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Storefront dev server (port 4360) |
| `pnpm seed` | Demo catalog and Homepage fields (dev server must run) |
| `pnpm typecheck` · `pnpm test` · `pnpm build` | The validation gate (`nx run-many`) |
| `pnpm check:ai` | Validates the `.ai/` layout, file names and memory index |

Astro 7's `astro dev` detaches: stop it with `npx astro dev stop` inside `apps/storefront`.

## For agents

[`AGENTS.md`](AGENTS.md) is the map; `.ai/README.md` describes the changelog, decisions, run logs and memory.

## License

[MIT](LICENSE)
