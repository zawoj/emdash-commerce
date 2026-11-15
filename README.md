# emdash-commerce

Commerce for [EmDash](https://github.com/emdash-cms/emdash) (the Astro-based CMS): a Stripe plugin, an image-with-points
field widget, a blue wireframe design system, and a demo storefront that uses all three. One Nx + pnpm monorepo.

**New here? Start with [docs/getting-started.md](docs/getting-started.md): from a fresh clone to a test purchase in the admin.**

| Path | Package | What |
|---|---|---|
| `apps/storefront` | `@emdash-commerce/storefront` | The demo shop: Astro 7 SSR on EmDash (Node + SQLite + local uploads). Home, shop, product page, cart, Stripe Checkout. |
| `packages/plugin-stripe` | `@emdash-commerce/plugin-stripe` | Backend-only commerce plugin (id `stripe-commerce`): catalog with variants and prices mirrored to Stripe, carts, Checkout Sessions, orders, refunds, disputes, subscriptions, a durable webhook pipeline. [README](packages/plugin-stripe/README.md) |
| `packages/plugin-image-hotspots` | `@emdash-commerce/plugin-image-hotspots` | React field widget `image-hotspots:hotspots`: an image with points (a product per point, or a title and text). [README](packages/plugin-image-hotspots/README.md) |
| `packages/design-system` | `@emdash-commerce/design-system` | Tokens and props-driven Astro components (blue wireframe, no decoration, no brand assets). [README](packages/design-system/README.md) |

Plugin ids (`stripe-commerce`, `image-hotspots`) and the widget reference (`image-hotspots:hotspots`) are stored in content
and schema, so they are part of the contract.

## Quickstart

**Full walkthrough, from zero to a test purchase: [docs/getting-started.md](docs/getting-started.md)** (prerequisites,
Stripe sandbox keys, every environment variable, the webhook secret, seeding, the admin login, resetting,
troubleshooting). The short version, with Node >= 24.22.1 (`.node-version`), pnpm 10 and the
[Stripe CLI](https://docs.stripe.com/stripe-cli) installed:

```bash
pnpm install
cp apps/storefront/.env.example apps/storefront/.env   # EMDASH_ENCRYPTION_KEY, STRIPE_SECRET_KEY (sandbox), STRIPE_WEBHOOK_SECRET
pnpm dev                                               # terminal 1: http://localhost:4360
stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook   # terminal 2: prints the whsec_... for .env, then restart
pnpm seed                                              # demo catalog, Homepage, and the Stripe catalog sync
```

Open <http://localhost:4360/shop>, add a product and pay with test card `4242 4242 4242 4242`. The admin is at
`/_emdash/admin`; sign in once with `http://localhost:4360/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`.
Reset by stopping the server and deleting `apps/storefront/data.db*` and `apps/storefront/uploads/`.

EmDash keeps its schema (collections and fields) and content in the database, not in the repo
(`.ai/memory/emdash-schema-lives-in-the-database.md`): the schema comes from `apps/storefront/seed/seed.json` through the
dev login and the commerce collections are created by the `stripe-commerce` plugin when the server starts. `pnpm seed`
(`scripts/seed-demo.mjs`, dependency-free and idempotent) adds the demo catalog and Homepage fields, then queues the
plugin's catalog resync and waits until Stripe has the products (sandbox key only; without a key it says what to run
later). `EMDASH_URL` points it at another port.

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
