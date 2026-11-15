# emdash-commerce

Commerce for [EmDash](https://github.com/emdash-cms/emdash) (the Astro-based CMS): a Stripe plugin, an image-with-points
field widget, a Cloudflare-orange design system, and a demo storefront that uses all three. One Nx + pnpm monorepo.

The demo shop is an **unofficial mock Cloudflare-merch store**: fictional products (tees, a windbreaker, desk gear, mugs,
stickers, bundles and a membership), generated art, USD prices, Stripe **sandbox** only. It is not affiliated with
Cloudflare, nothing is for sale and nothing ships. The theme is data, so the same code runs any other shop.

**New here? Two ways in:**

- **With an AI agent** (Claude Code, Codex, Cursor): open this repo in it and paste the prompt below, or read
  [docs/ai-guide.md](docs/ai-guide.md), which has the architecture map, what you can build and a prompt for each job.
- **By hand:** [docs/getting-started.md](docs/getting-started.md), from a fresh clone to a test purchase in the admin.

```text
You are in the emdash-commerce monorepo. Read AGENTS.md, .ai/README.md, .ai/memory/MEMORY.md and docs/ai-guide.md.
Then explain in under 40 lines what this project is, how a request travels from the browser to Stripe and back, and
which commands and invariants matter. Do not change anything. Ask me what I want to build, and plan before you edit.
Rules: Stripe sandbox keys only, never print a secret, do not commit unless I ask.
```

| Path | Package | What |
|---|---|---|
| `apps/storefront` | `@emdash-commerce/storefront` | The demo shop: Astro 7 SSR on EmDash (Node + SQLite + local uploads). Home, shop, product page, cart, Stripe Checkout. |
| `packages/plugin-stripe` | `@emdash-commerce/plugin-stripe` | Backend-only commerce plugin (id `stripe-commerce`): catalog with variants and prices mirrored to Stripe, carts, Checkout Sessions, orders, refunds, disputes, subscriptions, a durable webhook pipeline. [README](packages/plugin-stripe/README.md) |
| `packages/plugin-image-hotspots` | `@emdash-commerce/plugin-image-hotspots` | React field widget `image-hotspots:hotspots`: an image with points (a product per point, or a title and text). [README](packages/plugin-image-hotspots/README.md) |
| `packages/design-system` | `@emdash-commerce/design-system` | Tokens (orange on warm charcoal) and props-driven Astro components: flat, square, no decoration, no brand assets. [README](packages/design-system/README.md) |

Plugin ids (`stripe-commerce`, `image-hotspots`) and the widget reference (`image-hotspots:hotspots`) are stored in content
and schema, so they are part of the contract.

## Quickstart

**Full walkthrough: [docs/getting-started.md](docs/getting-started.md)** (prerequisites, Stripe sandbox keys, every
environment variable, the webhook secret, seeding, the admin login, resetting, troubleshooting). The short version, with
Node >= 24.22.1 (`.node-version`), pnpm 10 and the [Stripe CLI](https://docs.stripe.com/stripe-cli) installed and logged in:

```bash
pnpm install
pnpm bootstrap     # creates apps/storefront/.env, generates the encryption key, asks for your Stripe SANDBOX key,
                   # reads the webhook secret from the Stripe CLI, prints the next steps (a live key is refused)
pnpm dev           # terminal 1: http://localhost:4360
stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook   # terminal 2
pnpm seed          # the mock catalog, the Homepage fields, and the Stripe catalog sync
pnpm doctor        # read-only check: toolchain, .env, dev server, seeded catalog
```

After the very first seed on an empty database restart the server once (`npx astro dev stop` in `apps/storefront`, then
`pnpm dev`): EmDash reads the site URL at startup and checkout needs it.

Open <http://localhost:4360/shop>, add a product and pay with test card `4242 4242 4242 4242`. The admin is at
`/_emdash/admin`; sign in once with `http://localhost:4360/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin`.
Reset by stopping the server and deleting `apps/storefront/data.db*` and `apps/storefront/uploads/`.

EmDash keeps its schema (collections and fields) and content in the database, not in the repo
(`.ai/memory/emdash-schema-lives-in-the-database.md`): the schema comes from `apps/storefront/seed/seed.json` through the
dev login and the commerce collections are created by the `stripe-commerce` plugin when the server starts. `pnpm seed`
(`scripts/seed-demo.mjs`, dependency-free and idempotent) adds the catalog from `scripts/lib/merch-catalog.mjs` and the
Homepage fields, then queues the plugin's catalog resync and waits until Stripe has the products (sandbox key only; without
a key it says what to run later). `EMDASH_URL` points it at another port. The product photos are committed mock art in
`apps/storefront/public/merch/`, drawn by `scripts/art/` (`pnpm art`), so no network is needed.

## Commands

| Command | Does |
|---|---|
| `pnpm dev` | Storefront dev server (port 4360) |
| `pnpm bootstrap` | First-run setup of `.env` (idempotent, never prints a secret, refuses a live Stripe key) |
| `pnpm doctor` | Read-only check of the toolchain, `.env`, the dev server and the seeded catalog |
| `pnpm seed` | Mock catalog and Homepage fields (dev server must run) |
| `pnpm art` | Regenerates the mock product art into `apps/storefront/public/merch/` |
| `pnpm typecheck` · `pnpm test` · `pnpm build` | The validation gate (`nx run-many`) |
| `pnpm check:ai` | Validates the `.ai/` layout, file names and memory index |

Astro 7's `astro dev` detaches: stop it with `npx astro dev stop` inside `apps/storefront`.

## For agents

[`AGENTS.md`](AGENTS.md) is the map; [`docs/ai-guide.md`](docs/ai-guide.md) is the memo with the architecture and prompts;
`.ai/README.md` describes the changelog, decisions, run logs and memory.

Cloudflare and its marks belong to Cloudflare, Inc. This project is an independent demo and is neither endorsed by nor
affiliated with it.

## License

[MIT](LICENSE)
