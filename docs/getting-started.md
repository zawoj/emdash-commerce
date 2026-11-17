# Getting started: run the shop end to end

This page takes you from a fresh clone to a test purchase that shows up as an order in the admin. Everything runs on
your machine against a **Stripe sandbox**; no real money moves. Allow about 20 minutes the first time. The shop is an
unofficial **mock Cloudflare-merch store**: fictional products in USD, generated art, nothing ships.

**Shortcut:** after `pnpm install`, `pnpm bootstrap` does steps 3 and part of 4 for you (it creates `.env`, generates the
encryption key, takes your Stripe sandbox key and reads the webhook secret from the Stripe CLI, and refuses a live key);
`pnpm doctor` re-checks everything without changing anything. The sections below are the same steps by hand.

1. [Prerequisites](#1-prerequisites)
2. [A Stripe sandbox and its keys](#2-a-stripe-sandbox-and-its-keys)
3. [Environment variables](#3-environment-variables)
4. [Start the server and the webhook forwarder](#4-start-the-server-and-the-webhook-forwarder)
5. [Seed the demo shop](#5-seed-the-demo-shop)
6. [Sign in to the admin](#6-sign-in-to-the-admin)
7. [A first test purchase](#7-a-first-test-purchase)
8. [Reset to a clean state](#8-reset-to-a-clean-state)
9. [Troubleshooting](#9-troubleshooting)

## 1. Prerequisites

| Tool | Version | Why |
| --- | --- | --- |
| Node.js | **>= 24.22.1** | `.node-version` and the root `engines` pin it, and CI runs exactly that version, so it is the only one the repo is verified against. The seed script relies on Node 24 built-ins and the dev script on `node --env-file-if-exists` to load `.env`. An older Node may start but is unsupported: pnpm prints an engine warning and you are on your own. |
| pnpm | **10** (`packageManager` pins `pnpm@10.33.0`) | Run `corepack enable` once and the right version is picked from `package.json`. |
| Stripe CLI | current | Forwards sandbox webhooks to your local server (`stripe listen`). Without it payments succeed at Stripe but the shop never learns about them: no order. |
| A Stripe account | any | You use its **sandbox** only. |

Install and check:

```bash
# Node: use your version manager so the repo's .node-version is picked up
fnm use      # or: nvm use / mise install
node --version   # v24.22.1 or newer

corepack enable
pnpm --version   # 10.x

brew install stripe/stripe-cli/stripe    # other platforms: https://docs.stripe.com/stripe-cli
stripe login                             # opens the browser; pick the account whose sandbox you will use
```

Then, from the repository root:

```bash
pnpm install
```

## 2. A Stripe sandbox and its keys

1. In the [Stripe Dashboard](https://dashboard.stripe.com) switch to a **sandbox** (account menu, "Sandboxes"; create one
   if you have none). Everything below is done inside it. Test and live objects never mix, and the seed script
   refuses to sync the catalog with a live key.
2. **Developers, API keys.** You get a standard secret key (`sk_test_...`). It works, but a **restricted key**
   (`rk_test_...`) is the better habit because a leaked key can do only what you allowed. Create one with
   "Create restricted key" and give it these permissions (the plugin README has the same list, with the reasons):

   | Resource | Access |
   | --- | --- |
   | Products, Prices | Write |
   | Checkout Sessions | Write |
   | Customers | Write |
   | Subscriptions | Write |
   | Refunds | Write |
   | Customer portal | Write |
   | Webhook Endpoints | Write |
   | PaymentIntents, Invoices, Events | Read |
   | Account (optional) | Read: without it the admin shows the account as unknown |

   Dashboard labels shift a little between releases. If a permission is missing, the Commerce page in the admin and the
   server log say which call Stripe rejected ("Stripe rejected the API key (invalid, revoked or missing permission)"),
   so you can add it and try again.
3. Copy the key. It is shown once for restricted keys. Never commit it and never use a **live** key (`sk_live_`,
   `rk_live_`) for local work.

The Stripe CLI must belong to the **same account and sandbox** as the key, otherwise `stripe listen` forwards the
events of a different account and nothing arrives. Check with `stripe config --list` and `stripe login` again if needed.

## 3. Environment variables

```bash
pnpm bootstrap      # or by hand: cp apps/storefront/.env.example apps/storefront/.env
```

`apps/storefront/.env` is git-ignored. The dev and start scripts load it with `node --env-file-if-exists=.env`; plain
`astro dev` does **not**, so always start the server through `pnpm dev` (or the same `node --env-file...` command).

| Variable | Required | What it is |
| --- | --- | --- |
| `EMDASH_ENCRYPTION_KEY` | yes | The key EmDash uses to encrypt secrets stored in the database (plugin settings saved in the admin, the guest order-link secret), in EmDash's own format: `emdash_enc_v1_` followed by 43 base64url characters. A bare hex key (`openssl rand -hex 32`) is rejected. `pnpm bootstrap` generates one; by hand use `npx emdash secrets generate`. Keep it stable: changing it makes already-stored secrets unreadable. |
| `STRIPE_SECRET_KEY` | for payments | Your sandbox key from step 2 (`sk_test_...` or `rk_test_...`). Without it the shop still loads: catalog, cart and admin work, anything that calls Stripe answers `NOT_CONFIGURED` (503). |
| `STRIPE_WEBHOOK_SECRET` | for orders | The `whsec_...` that **`stripe listen` prints** ([next section](#4-start-the-server-and-the-webhook-forwarder)). It is not a value from the dashboard. |
| `COMMERCE_ACCESS_TOKEN_SECRET` | no | Signs the links in guest order emails. Generated on first activation when the encryption key is set; set it yourself only to share one value between environments. Not in `.env.example`. |

Two things worth knowing:

- A secret saved in the admin (Plugins, Stripe commerce, Settings) **wins over** the environment variable. If you pasted a
  key there once and later change `.env`, the old admin value is still used. Clear the setting in the admin to fall back
  to `.env`.
- Variables for the seed script are read from your shell, not from `.env`: `EMDASH_URL` (default
  `http://localhost:4360`; set it when you run on another port), `SEED_SYNC_TIMEOUT_SECONDS` (default 300) and, only for a
  deployed site, `EMDASH_TOKEN` (an `ec_pat_…` access token; locally the dev login is used and no token is needed).

## 4. Start the server and the webhook forwarder

**Terminal 1, the site** (port **4360**):

```bash
pnpm dev
```

Astro 7 detaches `astro dev` when it detects an agent or a non-interactive shell, so the command may return at once
while the server keeps running in the background. Manage it from `apps/storefront`:

```bash
cd apps/storefront
npx astro dev status    # is it running, and where
npx astro dev logs      # the server log
npx astro dev stop      # stop it
```

To use another port, start the same command by hand (the seed then needs `EMDASH_URL=http://localhost:4370`, and the
forwarding URL below must use the same port):

```bash
cd apps/storefront
node --env-file-if-exists=.env node_modules/astro/bin/astro.mjs dev --port 4370
```

**Terminal 2, the webhook forwarder:**

```bash
stripe listen --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook
```

It prints a line such as:

```
> Ready! You are using Stripe API Version [...]. Your webhook signing secret is whsec_1a2b3c... (^C to quit)
```

Copy that `whsec_...` into `STRIPE_WEBHOOK_SECRET` in `apps/storefront/.env` and **restart the server** (`npx astro dev
stop`, then `pnpm dev`), because the environment is read at start. To print only the secret: `stripe listen --print-secret`.

**This secret differs per machine and per CLI login.** It belongs to your Stripe CLI session, not to the Stripe account,
so a teammate, a second laptop or a fresh `stripe login` has another one. Leave `stripe listen` running while you test. The
sign of a mismatch is in the `stripe listen` output: every forwarded event ends in

```
<--  [400] POST http://localhost:4360/_emdash/api/plugins/stripe-commerce/webhook [evt_...]
```

instead of `[200]`. The server answers 400 for a signature it cannot verify. Fix: copy the current secret, put it in
`.env` (and clear a stale one in the admin settings, see above), restart the server. A `[503]` means no webhook secret
is configured at all.

## 5. Seed the demo shop

With the server running:

```bash
pnpm seed
```

On a fresh database the seed first applies the schema through the dev login. It also creates the dev-only `feedback` collection
(the Notes tool of the editing pill, `apps/storefront/seed/dev-tools.json`), which the production seed leaves out. Then it
creates, in this order:

- the site identity (title and tagline);
- the attribute vocabulary, brands and categories;
- five apparel products with size and colour variants and prices, twelve accessories (one low on stock, one sold out),
  two fixed-price bundles (Desk Setup, New Hire Welcome Kit) and an "Edge Club" membership with a recurring price;
- the Homepage fields: the call-to-action band, the shop-the-look points on the desk setup photo and the spotlight
  callouts on the jacket.

The catalog is data in `scripts/lib/merch-catalog.mjs`; the photos are committed art in `apps/storefront/public/merch/`
(regenerate with `pnpm art`). The prices are USD: the storefront registers the plugin with `defaultCurrency: "usd"` in
`apps/storefront/astro.config.mjs`.

**After the very first seed on an empty database, restart the server once** (`npx astro dev stop`, then `pnpm dev`). EmDash
reads the site URL when it starts, and on an empty database it is only stored by the setup the first run performs, so until a
restart the first checkout answers `NOT_CONFIGURED` ("a checkout redirect URL points outside the site's allowed origins").

Each photo is uploaded once to the media library (matched by file name). No network is needed: the art is in the repo.

- **Idempotent.** Everything is matched by slug or name, so running it again updates in place and creates no duplicates.
- **`--only`** runs part of it: `pnpm seed -- --only site,home` (names: `site`, `apparel`, `accessory`, `bundle`,
  `membership`, `home`).
- **Automatic Stripe sync.** At the end, when a sandbox key is configured, the seed queues the plugin's catalog resync and
  drives it until nothing is due (Stripe Products and Prices for every product and variant), printing progress and a
  clear message if it times out (`SEED_SYNC_TIMEOUT_SECONDS`, default 300) or if some entities failed. Look for the line
  `stripe: catalog synced (N entities)`. Without a key it prints what to run later instead: set `STRIPE_SECRET_KEY`,
  restart, then run `pnpm seed` again (or press "Resync catalog" on the Commerce page).

Why this matters: a product can only be bought once its prices exist in Stripe. A resync only *queues* the work and the
background task syncs 25 entities every five minutes, so the seed drives it itself. `pnpm catalog:resync` runs only that last
step (e.g. after a content import). The seed exits with code 1 when the sync times out or has failures.

**A deployed site** cannot be seeded through the dev login: `EMDASH_URL=https://… EMDASH_TOKEN=ec_pat_… pnpm seed` uses an
access token instead (scopes, setup wizard, import alternative: `docs/production.md`, "Seeding a deployed site").

## 6. Sign in to the admin

On localhost EmDash has a development login that needs no passkey. Open it once; a database that is not set up yet is
initialised by it:

- first time: <http://localhost:4360/_emdash/api/setup/dev-bypass?redirect=/_emdash/admin>
- later (new browser session): <http://localhost:4360/_emdash/api/auth/dev-bypass>

You land on the admin at <http://localhost:4360/_emdash/admin>. Orders, payments and the **Commerce** page (key and webhook
health, resync, reconcile, clean-up of abandoned checkouts, recent orders) are in its sidebar. Check that the Commerce page
shows your account and a webhook health of `ok` or `not_registered` (the latter is normal with `stripe listen`; there is
no endpoint registered at Stripe, events are forwarded by the CLI).

The dev login exists only in development. A deployed site uses passkeys and needs its own admin user.

## 7. A first test purchase

1. Open <http://localhost:4360/shop>, pick a product, choose the options (size, colour) and add it to the cart.
2. Open the cart and press **Checkout**. You are redirected to Stripe's hosted page. The line item is named
   "Product name, then options", for example "Packet Windbreaker — XL / Orange".
3. Pay with the test card **4242 4242 4242 4242**, any future expiry, any three-digit CVC and any name and postcode.
   (Other cards, such as one that declines, are listed in the [Stripe docs](https://docs.stripe.com/testing).)
4. Stripe sends you back to the success page. In the `stripe listen` terminal you should see
   `checkout.session.completed` followed by `[200]`.
5. In the admin open **Commerce**: the order appears under "Recent orders" with its number (`ORD-<year>-00001`), status
   paid and the total. The full record is under the **Orders** collection (lines, payment, timeline), and **Payments** and
   **Customers** have the matching entries. A confirmation email is sent through EmDash's email provider if one is
   configured (none is needed for the admin order list to update).

6. **Guest order link in development.** With the default console email provider, messages are not delivered to a real inbox.
   After signing in through the [dev login](#6-sign-in-to-the-admin) (same browser session), open
   <http://localhost:4360/_emdash/api/dev/emails> — JSON list of captured mails. Find the order confirmation and copy the
   **View your order** link (it points at `/orders/view?token=…`). Open it in the browser: you should see the order number,
   statuses, lines and totals. That page is never cached and must not be shared (the token is a bearer secret).

7. **If you lose the email link**, open <http://localhost:4360/orders/lookup>, enter the email you used at Stripe Checkout
   and the order number from the admin (for example `ORD-2026-00001`). The form always shows the same success message
   whether or not a matching order exists; when it matches, EmDash sends another access-link email (again visible at
   `/_emdash/api/dev/emails` in dev).

If the order does not show up in the admin, jump to [Troubleshooting](#9-troubleshooting); nearly always it is the webhook secret.
If `/orders/view` answers 500, check `EMDASH_ENCRYPTION_KEY` format — [troubleshooting](#9-troubleshooting).

Checkouts you start and do not pay are cleaned up by the shop itself: Stripe expires the session, the stock hold is
released, and the maintenance task removes the leftover records after a retention period (48 hours by default). To clean
up immediately press **Clean up abandoned checkouts** on the Commerce page.

## 8. Reset to a clean state

Everything local (schema, content, orders, uploaded media) lives in `apps/storefront/data.db*` and `apps/storefront/uploads/`.

```bash
cd apps/storefront
npx astro dev stop
rm -rf data.db data.db-shm data.db-wal uploads
cd ../..
pnpm dev          # then, with the server up:
pnpm seed
```

Open the dev login again afterwards (step 6). Stripe sandbox objects are not removed: the new seed creates new Products and
Prices next to the old ones (archive the old ones in the dashboard if they bother you, or create a fresh sandbox).
A database created before the move to USD still has a PLN-only `currency` select on prices: reset it as above.

## 9. Troubleshooting

| Symptom | Cause and fix |
| --- | --- |
| Checkout fails, or the cart shows an item as "not synced" | The catalog is not in Stripe yet. Run `pnpm seed` again with a key configured (it syncs at the end), or press **Resync catalog** on the Commerce page and wait: the background task does 25 entities per five minutes. Calling the `commerce_catalog_sync` tool (or `admin/catalog/sync`) repeatedly drives it faster. Details: `.ai/memory/emdash-plugin-stripe-resync-is-slow-by-design.md`. |
| `stripe listen` refuses to start and asks you to specify events | Reported with Stripe CLI 1.55.11 (the version the e2e setup ran against; 1.40.3 starts without it): add `--all-snapshot` to the command, e.g. `stripe listen --all-snapshot --forward-to localhost:4360/_emdash/api/plugins/stripe-commerce/webhook`. |
| `stripe listen` shows `[400]` for every event | Wrong `STRIPE_WEBHOOK_SECRET` (it differs per CLI login). Copy the secret `stripe listen` printed into `.env`, clear any stale value in the admin plugin settings, restart the server. |
| `stripe listen` shows `[503]` | No webhook secret configured at all. Same fix. |
| Paid at Stripe, no order in the admin | The webhook did not arrive or failed. Is `stripe listen` running, forwarding to the right port, with the same account as your key? The Commerce page lists failed or dead webhook events and can replay one. **Reconcile now** fetches events the site missed. |
| Checkout answers 503 `NOT_CONFIGURED` | No `STRIPE_SECRET_KEY`, or the server was started without `.env` (plain `astro dev`). Start with `pnpm dev` and restart after editing `.env`. |
| Very first checkout after the first seed answers `NOT_CONFIGURED` "points outside the site's allowed origins" | EmDash read the site URL before setup stored it. Restart the server once (`npx astro dev stop`, `pnpm dev`); see `.ai/memory/emdash-site-url-is-read-at-startup.md`. |
| Stripe rejects the key | A restricted key without a needed permission (step 2). The message names the call. |
| `pnpm doctor` says the encryption key is wrong, the log says `EMDASH_ENCRYPTION_KEY entry is malformed`, or `/orders/view` and the access-link email answer 500 | The key is not in EmDash's format (`emdash_enc_v1_` + 43 characters; a hex key from an old `.env` is rejected). Generate one with `npx emdash secrets generate` and restart. Do not replace a key on a database that already stored secrets (they become unreadable): reset the database instead (step 8). `.ai/memory/emdash-encryption-key-format.md`. |
| Node version warning at `pnpm install` or start | You are on a Node older than 24.22.1. Switch with your version manager (`fnm use`, `nvm use`), reinstall if needed. |
| `astro dev` returns immediately, "nothing happens" | Astro 7 detaches the dev server in agent and CI-like shells. It is running: `npx astro dev status`, `npx astro dev logs`, `npx astro dev stop` (run in `apps/storefront`). Port busy means an old server is still up; stop it first. |
| Admin stuck on "Loading EmDash..." | Usually the shared Vite cache: a build (`pnpm build`, or the gate) ran next to the dev server and overwrote its pre-bundled dependencies. Stop the server, delete `apps/storefront/node_modules/.vite*` and `.astro`, start with `astro dev --force`. `.ai/memory/emdash-dev-and-build-share-vite-cache.md` and `emdash-admin-infinite-loading.md` have the details. |
| `pnpm seed` says dev login failed or `SETUP_REQUIRED` | The server is not running, runs on another port (`EMDASH_URL=http://localhost:<port> pnpm seed`), or the database was created by something else. Reset (step 8). |
| Seed ends with "no key configured" | Expected without a Stripe key. Add `STRIPE_SECRET_KEY`, restart, run `pnpm seed` again. |
| Seed ends with "timed out" or "failed" | Some entities did not sync in time or Stripe rejected them. Open the Commerce page for the error (usually key permissions), fix, and run `pnpm seed` again. |
| A product page for a slug that does not exist | That is a real 404 now; check the slug in the admin. |

More background: the plugin's design and flows are in `packages/plugin-stripe/docs/` (`architecture.md`, `api.md`,
`extending.md`), and the traps found along the way are in `.ai/memory/`.
