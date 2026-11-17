---
name: wrangler-passes-only-required-secrets-to-the-worker
description: with `secrets` in wrangler.jsonc, local dev forwards only the listed required secrets to workerd, so STRIPE_WEBHOOK_SECRET (webhooks 503) and EMAIL_SMTP_* in .dev.vars never arrive; and a found .dev.vars.<env> stops .env from being read
metadata:
  type: project
---

# Optional secrets do not reach the Worker in local dev

Found 2026-11-17 while running the purchase suite on workerd (wrangler 4.163.0, `@cloudflare/vite-plugin` 1.69.1).

- `apps/storefront/wrangler.jsonc` declares `"secrets": { "required": ["EMDASH_ENCRYPTION_KEY", "STRIPE_SECRET_KEY"] }`. In
  `getVarsForDev`, once `secrets` is set, a value from `.dev.vars` / `.env` / `process.env` is handed to the Worker only if it is
  a declared var or in `required`. `STRIPE_WEBHOOK_SECRET` is neither, so it is silently dropped and `POST .../webhook` answers
  **503** (`NOT_CONFIGURED`, "no signing secret") for every forwarded event; the sandbox purchase then stalls at "Paid" without an
  order number.
- Fix used by the e2e suite: store the signing secret as the plugin's encrypted setting
  (`PUT /_emdash/api/admin/plugins/stripe-commerce/settings`, body `{ "values": { "stripeWebhookSecret": "whsec_..." } }`, dev
  login first), the same place "Register webhook" writes. Do it before the seed so the catalog-sync events are verified too.
  `docs/cloudflare.md` lists `STRIPE_WEBHOOK_SECRET` as an optional Worker secret; that was checked only as the encrypted setting
  (the deployed path was not tried), and the local `.dev.vars` route does not work, so for local dev use the setting.
- Isolation trick: the Worker's secret file is chosen by `CLOUDFLARE_ENV`: wrangler reads `.dev.vars.<env>` first, and when a
  `.dev.vars*` file is found it does **not** read `.env` (and does not merge `process.env`). So `CLOUDFLARE_ENV=e2e` plus a
  generated `.dev.vars.e2e` keeps the developer's `.env` keys out of a test run. Without such a file `.env` values win over
  `process.env`. The price is a harmless warning that `wrangler.jsonc` has no `env.e2e`.
- The same filter drops `EMAIL_SMTP_*` (seen by the email work, `docs/email.md`): with the four SMTP names in `.dev.vars`,
  `GET /_emdash/api/settings/email` answered `smtp.configured: false` and the console provider stayed selected; adding them to
  `secrets.required` gave `source: "env"` and selected `emdash-builtin-smtp`. For local runs save SMTP in Settings → Email (works,
  verified) instead of listing the names permanently: a listed secret becomes mandatory for every deploy and the Deploy button.
  `smtp.source` (`env` / `db` / `null`) in that response tells which one is active.
- What a **deployed** Worker does with a secret set by `wrangler secret put` that is not listed is **still untested**: the 2026-11-17 attempt on a temporary preview account never got a Worker up (no R2, 5 MiB asset limit: `cloudflare-temporary-account-cannot-host-the-shop.md`). New finding from it: `wrangler deploy` of a new Worker *refuses* while a `secrets.required` secret is missing, so the first deploy needs `--secrets-file`.
- The astro process's own environment never reaches workerd; only these files do.
