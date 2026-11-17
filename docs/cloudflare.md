# Running the storefront on Cloudflare (Workers + D1 + R2)

`apps/storefront` has two runtime targets from one codebase. **Node** (SQLite file, uploads on disk) is the default and what
`pnpm dev` / `pnpm build` use. **Cloudflare** (a Worker, D1 database, R2 bucket) is selected with `DEPLOY_TARGET=cloudflare`.
The decision is in `.ai/decisions/2026-11-17-cloudflare-target-switch.md`. Short version of what is in the repo:

| File | Role |
| --- | --- |
| `apps/storefront/astro.config.mjs` | `DEPLOY_TARGET=cloudflare` picks `@astrojs/cloudflare` + `d1({ binding: "DB" })` + `r2({ binding: "MEDIA" })`; unset is the Node config, unchanged. Plugins, the `@emdash-cms/admin` alias and `ssr.noExternal` are shared. |
| `apps/storefront/wrangler.jsonc` | Bindings (`DB`, `MEDIA`, `EMDASH_ROOMS` Durable Object), `nodejs_compat`, the cron trigger, the required secrets. |
| `apps/storefront/src/worker.ts` | Worker entry from the EmDash Cloudflare templates: re-exports the Durable Object classes and wires the cron (`scheduled`). |
| `apps/storefront/worker-configuration.d.ts` | Output of `pnpm --filter @emdash-commerce/storefront types:cloudflare` (`wrangler types`). Regenerate after changing `wrangler.jsonc`. Checked by `tsconfig.cloudflare.json`, apart from the DOM-based `src`. |
| `apps/storefront/.dev.vars.example` | The secrets, for local runs. |

Everything below was checked on 2026-11-17 on workerd without a Cloudflare account unless it says otherwise; section
[What was verified](#what-was-verified) lists exactly what.

## Prerequisites

- A Cloudflare account on the **Workers Paid plan**. EmDash plus this shop (D1 queries, Stripe calls, server rendering) do not fit the Free
  plan's 10 ms CPU time per request and 50 subrequests per invocation (Cloudflare's limits page); not measured, so treat it as the safe choice. The built Worker is about 24 MiB
  uncompressed (6 MiB gzipped), under the 64 MiB limit that Cloudflare's limits page gives (it states there is no compressed
  limit).
- Node >= 24.22.1, pnpm (see `packageManager` in the root `package.json`), Wrangler (installed with the app) and
  `pnpm wrangler login` — you do this yourself; nothing in this repo logs in or deploys for you.
- A Stripe **sandbox** account and its secret or restricted key (permissions: `docs/getting-started.md`).
- A domain or the `*.workers.dev` name. The setup wizard and passkeys are bound to the hostname you first open it on.

## Run it locally on workerd first

This is the check to repeat before every deploy. `astro dev` with the Cloudflare adapter runs the real `workerd` runtime
with local D1/R2/Durable Object emulation (state in `apps/storefront/.wrangler/state`), and `import.meta.env.DEV` stays true,
so the dev login the seed uses works.

```bash
cp apps/storefront/.dev.vars.example apps/storefront/.dev.vars   # or keep using apps/storefront/.env, which wrangler reads too
# fill EMDASH_ENCRYPTION_KEY (pnpm bootstrap makes one) and a Stripe sandbox STRIPE_SECRET_KEY
pnpm --filter @emdash-commerce/storefront dev:cloudflare --port 4361
EMDASH_URL=http://localhost:4361 pnpm seed          # in a second shell; takes a few minutes (it syncs ~75 Stripe entities)
```

Restart the server once after the first seed (the site URL is read at startup:
`.ai/memory/emdash-site-url-is-read-at-startup.md`). Forward webhooks with
`stripe listen --forward-to localhost:4361/_emdash/api/plugins/stripe-commerce/webhook`.

To exercise the **built** Worker (what is deployed, `import.meta.env.DEV` false) on the same local D1:

```bash
pnpm --filter @emdash-commerce/storefront build:cloudflare
cd apps/storefront && pnpm exec wrangler dev --port 4361     # reads .dev.vars; cron: curl localhost:4361/cdn-cgi/local/scheduled
```

Stop the Node dev server first or use another port; the two targets keep separate data (`data.db` vs `.wrangler/state`). The
end-to-end suite uses neither: `pnpm test:e2e:smoke:cloudflare` keeps its state in a throwaway `.e2e-cloudflare/` (`docs/testing.md`).

## Deploy

1. **Secrets and resources.** `wrangler.jsonc` names the D1 database `emdash-commerce` and the R2 bucket
   `emdash-commerce-media`; change the names there if you want others. On the first `wrangler deploy` Wrangler creates both
   if they do not exist and reconnects later deploys to them (EmDash's deployment guide). Set the secrets (each prompts for the
   value, nothing is printed or stored in the repo):

   ```bash
   cd apps/storefront
   pnpm exec wrangler secret put EMDASH_ENCRYPTION_KEY    # emdash_enc_v1_ + 43 base64url chars: npx emdash secrets generate
   pnpm exec wrangler secret put STRIPE_SECRET_KEY        # sk_test_… or rk_test_… (sandbox)
   ```

   On a brand-new account the Worker does not exist yet: Wrangler offers to create it when you put the first secret, or run
   the deploy (step 2) first and set the secrets right after; until they exist the shop answers `NOT_CONFIGURED`.
   `wrangler.jsonc` lists both under `secrets.required` (used for `wrangler types` and a warning in local dev when one is
   missing; whether `wrangler deploy` refuses a missing one was not tried). Both prompts and the first deploy were not run:
   they need an account.

2. **Build and deploy.**

   ```bash
   pnpm --filter @emdash-commerce/storefront deploy:cloudflare     # = build:cloudflare, then wrangler deploy
   ```

   `pnpm exec wrangler deploy --dry-run` (after `build:cloudflare`) validates the output without touching an account.
   EmDash applies its core migrations on the first request (`emdash migrate` exists for large sites or a controlled moment:
   `docs/production.md`).

   The build inlines `apps/storefront/seed/seed.json` (`package.json#emdash.seed`) and the first request applies its schema to
   the empty D1 database. That file no longer contains the `feedback` collection of the Notes dev tool (it lives in
   `seed/dev-tools.json`, applied by `pnpm seed` against a dev server only), so nothing needs removing for a real production site.
   Note that `emdash site import` is refused on the freshly deployed shop until the relation definitions the commerce plugin
   created are cleared (`docs/production.md`, "Seeding a deployed site").

3. **First administrator.** Open `https://<your host>/_emdash/admin` straight after the deploy and finish the setup wizard
   with a **passkey**: the first person through it becomes the administrator, so do it before anyone else can. The dev login
   (`/_emdash/api/setup/dev-bypass`, `pnpm seed`'s login) exists only under `astro dev` and is absent from the deployed Worker.
   Passkeys work only on the hostname that created them; change the domain and you re-register.

4. **Email.** The commerce plugin's order emails go through EmDash's email pipeline, as do magic links and invites. In
   development a console provider prints them; **a deployed site has no provider until you set one**: Settings → Email in the
   admin (SMTP on port 587 or 465: `EMAIL_SMTP_*` or saved in the admin; or a provider plugin). Without one, order
   confirmation and the guest order-link emails are not delivered, and the shop does not say so. Setup, a worked example, how
   to test and what was run (including a workerd trap with `.dev.vars`) are in [email.md](email.md). No relay was tried from a
   deployed Worker.

5. **Register the Stripe webhook.** Stripe cannot call `localhost`, and a deployed site has no `stripe listen`. In the admin
   open Commerce (the plugin's status page) and press **Register webhook**, or call the MCP tool
   `commerce_webhooks_register` (REST: `POST /_emdash/api/plugins/stripe-commerce/admin/webhooks/register`, permission
   `plugins:manage`). It creates the endpoint `https://<your host>/_emdash/api/plugins/stripe-commerce/webhook` in your Stripe
   account for the events the plugin handles and **stores the signing secret encrypted in D1** (`isSecretStored`), so
   `STRIPE_WEBHOOK_SECRET` is not needed. Check `admin/status` → `webhook.health` is `ok`. Register it after the site URL is
   final: the endpoint URL is built from it. Use the Stripe **sandbox** account; never a live key outside a deployed
   production environment you intend to be live.

6. **Catalog and content.** Finish the setup wizard first (step 3), create an API token in the admin (Settings, API Tokens, scope
   `admin`, a short expiry) and run, from your machine:

   ```bash
   EMDASH_URL=https://<your host> EMDASH_TOKEN=ec_pat_… pnpm seed
   ```

   It creates the vocabulary, products, variants, prices, media and the Homepage fields over the REST API with
   `Authorization: Bearer` (no dev login), then drives the Stripe catalog resync (`admin/catalog/sync`) until nothing is due; re-run
   it any time. `pnpm catalog:resync` runs only the resync. Alternatives: create products in the admin or over MCP
   (`docs/production.md`), or move a seeded local site with `emdash site export` / `import` and then run
   `pnpm catalog:resync` (Stripe ids live in plugin storage, not in the export; `docs/production.md`). Both paths were run on a
   **local built Node server** only; against D1/R2 on a Cloudflare account they were not run.

## Secrets: where each one comes from

| Name | Where it lives on Cloudflare | Notes |
| --- | --- | --- |
| `EMDASH_ENCRYPTION_KEY` | Worker secret (`wrangler secret put`) | **Required.** `emdash_enc_v1_` + 43 base64url characters (`.ai/memory/emdash-encryption-key-format.md`). Encrypts everything the plugin saves as a secret. A hex key is rejected; changing the key on a database that already stored a secret makes the stored secrets unreadable. Keep a copy in your password manager: D1 backups do not contain it. |
| `STRIPE_SECRET_KEY` | Worker secret | **Required** unless the key is saved in the admin (Plugins → Stripe commerce → Settings; that needs the encryption key). A value saved in the admin wins over the environment. |
| `STRIPE_WEBHOOK_SECRET` | Worker secret *or* the encrypted setting that **Register webhook** writes | Optional. |
| `COMMERCE_ACCESS_TOKEN_SECRET` | Worker secret, or generated | Optional. Signs the guest order links; generated and stored encrypted on first use when the encryption key exists. Changing it invalidates links already emailed. |

How the plugin reads them (`packages/plugin-stripe/src/adapters/emdash/settings.ts`): first the encrypted plugin setting,
then `process.env[NAME]`. On Workers, `nodejs_compat` with a compatibility date from 2025-04-01 on fills `process.env` with
the Worker's string vars and secrets, so the fallback works unchanged; `wrangler.jsonc` pins both
(`compatibility_flags: ["nodejs_compat"]`, `compatibility_date: "2026-02-24"`). The plugin has no other Node dependency: it
talks to Stripe with the SDK's `fetch` client and verifies webhooks and signs links with Web Crypto
(`packages/plugin-stripe/src/workers-compat.test.ts` keeps it that way). Locally, `wrangler`/the adapter load
`.dev.vars` (or `.env`) into the same bindings.

Do not put secret values in `wrangler.jsonc` `vars`, `astro.config.mjs` or `import.meta.env`: they would end up in the bundle or the repo.

## Differences from the Node target

| | Node (default) | Cloudflare |
| --- | --- | --- |
| Start | `pnpm dev` / `pnpm build` + `pnpm start` | `dev:cloudflare` / `build:cloudflare` + `wrangler deploy` |
| Database | SQLite `apps/storefront/data.db` | D1 `DB` (local emulation in `.wrangler/state`) |
| Media | `apps/storefront/uploads` | R2 `MEDIA` |
| Env | `node --env-file-if-exists=.env` | `.dev.vars` / `.env` locally, Worker secrets in production |
| Port | `4360` (pinned in the script) | Astro's default `4321`; pass `--port` (the docs use `4361`) so it does not collide with the Node dev server |
| Sessions, images | none needed | the adapter adds a `SESSION` KV namespace and an `IMAGES` binding (Wrangler's automatic provisioning is expected to create the KV namespace on deploy — not tried; image optimisation uses Cloudflare Images, not `sharp`) |
| Background work | the plugin's cron runs in the Node process | the `* * * * *` Worker cron calls the same scheduled task (`commerce-maintenance`) |
| Dev login | yes | `astro dev` yes, deployed no (passkey) |

## Known limits and things to know

- **Deploy to Cloudflare button: it cannot deploy this repo as it stands.** Cloudflare's docs state that a button URL with a
  subdirectory treats that subdirectory as the root of the new repository, and the application must be fully isolated in it
  with all its dependencies, otherwise the build fails. `apps/storefront` depends on the sibling workspace packages
  `@emdash-commerce/design-system`, `plugin-stripe` and `plugin-image-hotspots` (`workspace:*`), which are not on npm and
  would not be copied. The URL
  `https://deploy.workers.cloudflare.com/?url=https://github.com/zawoj/emdash-commerce/tree/main/apps/storefront` would
  therefore fail to build; the `cloudflare` block in `apps/storefront/package.json` (label, products, bindings with
  descriptions) is in place so it works the day a standalone copy exists (a generated repo that vendors the three packages, or
  publishing them to npm). Not tried — the button clones into a Cloudflare account.
- **What does work for one-click-ish deploys: Workers Builds on this repo.** In the dashboard, Workers & Pages → Create →
  import the Git repository, set the **root directory** to `apps/storefront` (Cloudflare supports monorepos this way), build
  command `pnpm --filter @emdash-commerce/storefront build:cloudflare` (run from the repository root, so the workspace
  installs), deploy command `pnpm exec wrangler deploy`, and add the two secrets as build/runtime variables. Not tried here.
- **Workers Paid plan** is needed in practice (CPU time and subrequest limits above). Sandboxed (marketplace) plugins also
  need Paid; the two plugins of this shop are trusted and run in the Worker, so `worker_loaders` stays commented out.
- **Cron granularity.** The cron fires every minute; the plugin's maintenance task still syncs 25 catalog links per five
  minutes (`.ai/memory/emdash-plugin-stripe-resync-is-slow-by-design.md`).
- **Request limits.** A single request that does a lot (the catalog resync batch, a checkout with many lines) makes many D1
  and Stripe calls; on Paid the limit is 10 000 subrequests and a 30 s default CPU budget. The local run synced 75 Stripe
  entities and finished a checkout without hitting a limit; a production load was not measured.
- **Preview deployments and named environments** do not list `EMDASH_ROOMS`, so the editor falls back to single-editor mode
  (EmDash's guide). `SESSION`/`IMAGES` are bindings the adapter adds; `wrangler types` does not list them in
  `worker-configuration.d.ts` (only the ones in `wrangler.jsonc`).
- **Backups.** D1 Time Travel (7 days Free, 30 Paid) restores the database in place; it does not restore R2 media or the
  encryption key.

## What was verified

On 2026-11-17, on macOS, Node 24.22.1, `@astrojs/cloudflare` 14.3.4, `@emdash-cms/cloudflare` 1.5.0, `wrangler` 4.163.0,
workerd 1.20261116.1, Stripe sandbox, no Cloudflare account (nothing was logged in to, deployed or provisioned):

- `DEPLOY_TARGET=cloudflare astro build` succeeds; `wrangler deploy --dry-run` accepts `dist/server/wrangler.json` and lists the bindings
  `EMDASH_ROOMS`, `SESSION`, `DB`, `MEDIA`, `IMAGES`, `ASSETS` (about 24 MiB uncompressed, 6 MiB gzip).
- `astro dev` on workerd with local D1/R2: schema reconciled by the plugin, `pnpm seed` completed including the Stripe catalog
  sync (75 entities), `/shop` and `/` answered 200, a sandbox purchase with the Playwright script went through hosted
  Checkout to the success page ("paid", order `ORD-2026-00001`), and `stripe listen` showed `[200]` for every forwarded event
  (the signed webhook verified with Web Crypto on workerd). `admin/status` saw the Stripe key from the environment.
- The **built** Worker under `wrangler dev` (production bundle, `DEV` false) on the same D1: `/shop` 200, a second sandbox
  purchase (`ORD-2026-00002`, paid, webhook processed), and the cron entry point
  (`/cdn-cgi/local/scheduled`) ran `[plugin:stripe-commerce] Maintenance run finished { failed: 0 }`.
- A guest order-link request signed a token on workerd (the access-token secret was generated and stored encrypted); the
  link was in the dev email log. Opening the link was not checked on this target.

On 2026-11-17 (same machine and versions) the Playwright suite also ran against this target: `pnpm test:e2e:smoke:cloudflare`
(`astro dev` on workerd, throwaway local D1/R2 state in `.e2e-cloudflare/`, 41 passed, 4 skipped known-issue cases) and the purchase
project (3 passed: cart quantity, a sandbox purchase through hosted Checkout with the signed webhook and the emailed order link,
the lookup-page link), plus a measurement in the suite that the server really is `workerd`. It runs in CI on every pull request
(smoke) and weekly (purchase). It is the dev server, not the built Worker; details and limits in `docs/testing.md`.

Email (`docs/email.md`): under the local workerd dev server SMTP settings saved through the admin API, and a send reached a real
SMTP server through STARTTLS to its login step; no message was delivered from Workers.

Not checked: a real Cloudflare deploy, a real domain and passkey login, an email delivered from a Worker, the Deploy button, Workers Builds,
`emdash site import` into D1, behaviour under Workers CPU or subrequest limits, `wrangler dev --remote`.
