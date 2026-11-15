# @emdash-commerce/storefront

An unofficial mock Cloudflare-merch shop on [EmDash](https://github.com/emdash-cms/emdash): Astro 7 server-rendered, Node + SQLite, local media
uploads. It is the demo site of this repo and the reference for how a storefront talks to
[`@emdash-commerce/plugin-stripe`](../../packages/plugin-stripe/README.md) and renders with
[`@emdash-commerce/design-system`](../../packages/design-system/README.md).

| Route | What |
|---|---|
| `/` | Home: hero, product rails, spotlight with callouts, shop-the-look with points, CTA band, FAQ |
| `/shop`, `/shop/<slug>` | Product archive with filters, product page (variant axes, gallery, buy box) |
| `/cart`, `/checkout/success` | Cart and the Stripe Checkout return page |
| `/posts`, `/pages/<slug>`, `/search`, `/rss.xml` | The blog side of the EmDash blog template |
| `/_emdash/admin` | EmDash admin (content, media, the Commerce page) |

Run it from the repository root (`pnpm dev`, `pnpm seed`); setup is in the [root README](../../README.md). Storefront-specific
rules for agents are in [`AGENTS.md`](./AGENTS.md).
