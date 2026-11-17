# EmDash Commerce — Cloudflare template

> **Unofficial community demo.** A mock Cloudflare-merch store (fictional products, USD, generated art) built on
> [EmDash](https://github.com/emdash-cms/emdash). It is **not** an official EmDash or Cloudflare product.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/zawoj/emdash-commerce/tree/cloudflare-template)

An Astro 7 SSR storefront on EmDash with the Stripe commerce plugin, on **Cloudflare Workers + D1 + R2** (plus the `EmDashRoom`
Durable Object for co-editing and a cron trigger). It is a self-contained copy of `apps/storefront` from
[zawoj/emdash-commerce](https://github.com/zawoj/emdash-commerce).

> **This repository is generated.** It is rebuilt from the monorepo by `pnpm template:cloudflare` (workflow
> `.github/workflows/cloudflare-template.yml`) and force-pushed to the `cloudflare-template` branch. Do not send changes here:
> open them against [zawoj/emdash-commerce](https://github.com/zawoj/emdash-commerce). Generated from commit `3a12a33`.

The three `@emdash-commerce/*` packages (`design-system`, `plugin-stripe`, `plugin-image-hotspots`) are **vendored** in `vendor/`, exactly as `pnpm pack` would ship them, and installed with `file:` specs, so the repo builds on its own with no workspace and no npm release.

## Deploy

1. Press the button above. Cloudflare clones this branch into your account and provisions the D1 database and the R2 bucket.
2. Fill the two required secrets in the form (they are Worker secrets, never committed):
   - `EMDASH_ENCRYPTION_KEY` — `emdash_enc_v1_` + 43 base64url characters. Generate it with `npx emdash secrets generate`.
     Keep a copy: D1 backups do not contain it, and changing it makes stored secrets unreadable.
   - `STRIPE_SECRET_KEY` — a Stripe **sandbox** key (`sk_test_...` / `rk_test_...`) from the Stripe dashboard.
3. Open `https://<your worker>/_emdash/admin`, finish the setup wizard, then **Plugins → Stripe commerce → Register webhook**.
   That stores the webhook signing secret encrypted in D1, so `STRIPE_WEBHOOK_SECRET` is optional.
4. Set up email (order confirmations and guest order links need an SMTP provider): Settings → Email in the admin, see
   [docs/email.md](https://github.com/zawoj/emdash-commerce/blob/main/docs/email.md).
5. Create products in the admin, or fill the mock catalog from a clone of the monorepo with an API token (Settings → API
   Tokens, scope `admin`): `EMDASH_URL=https://<your worker> EMDASH_TOKEN=ec_pat_... pnpm seed` — see
   [docs/production.md](https://github.com/zawoj/emdash-commerce/blob/main/docs/production.md), "Seeding a deployed site".

Build and deploy commands Cloudflare runs: `pnpm run build` (Cloudflare target) and `pnpm run deploy` (`wrangler deploy`).
The Workers **Paid** plan is needed in practice (CPU time and subrequest limits).

## Local development

```sh
pnpm install
cp .dev.vars.example .dev.vars   # fill in the secrets
pnpm dev                          # astro dev on workerd, http://localhost:4361
pnpm build && pnpm exec wrangler dev   # the production bundle
pnpm typecheck
```

Requires Node >= 24.22.1 (see `engines`). `wrangler.jsonc` names the database `emdash-commerce` and the bucket
`emdash-commerce-media`; rename them before the first deploy if you like.

## More

Everything else — the architecture, the plugin API, the Cloudflare guide, limits — lives in the monorepo:
[docs/cloudflare.md](https://github.com/zawoj/emdash-commerce/blob/main/docs/cloudflare.md) and [README](https://github.com/zawoj/emdash-commerce#readme). MIT licensed.
