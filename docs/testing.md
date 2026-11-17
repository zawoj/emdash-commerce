# Testing

How the repo is tested, from the cheapest check to the most realistic one. Run the first five before every PR (`pnpm
check:ai`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`); CI repeats them. The end-to-end suite is the sixth
layer: its smoke part runs in CI on every PR (on Node and on the Cloudflare target), the part that needs Stripe runs on demand and weekly.

| Layer | Command | What it proves | Needs |
| --- | --- | --- | --- |
| Repo layout | `pnpm check:ai` | `.ai/` names, folders and the memory index are valid | nothing |
| Lint | `pnpm lint` | oxlint, zero errors | nothing |
| Types | `pnpm typecheck` | `astro check` (storefront, design system), `tsc` (plugins, the Worker entry, `e2e/`) | nothing |
| Design-system lints | `pnpm nx test design-system` | `token-lint` (no raw colours or sizes outside the tokens), `wireframe-lint` (the flat Cloudflare skin: no shadow, gradient or local `filter`), contrast of the token pairs | nothing |
| Unit and integration | `pnpm test` (every project) or `pnpm nx test <project>` | behaviour of services, hooks, helpers, client scripts and the seed's catalog data | nothing |
| Build | `pnpm build` | the storefront builds; the plugins typecheck as packages | nothing |
| End-to-end, smoke | `pnpm test:e2e:smoke` | the shop works in a real browser against a real server, no Stripe | Chromium |
| End-to-end, purchase | `pnpm test:e2e` (or `pnpm exec playwright test --project=purchase`) | a real sandbox purchase, from the cart to the emailed order link | Chromium, a Stripe sandbox key, the Stripe CLI |
| End-to-end, Cloudflare target | `pnpm test:e2e:smoke:cloudflare` (and `pnpm test:e2e:cloudflare` with the purchase suite) | the same specs on workerd with local D1/R2 ([below](#the-cloudflare-target)) | Chromium (and the Stripe key and CLI for purchase) |

## Unit and integration tests (Vitest)

- `packages/plugin-stripe` — the plugin's services (catalog sync, carts, checkout, orders, webhooks, settlement, access
  tokens, the outbox) against in-memory ports, a fixed clock and a fake Stripe provider (the same pieces are exported to a
  site as `@emdash-commerce/plugin-stripe/testing`). Nothing here touches the network.
- `packages/plugin-image-hotspots` — the field widget's model and helpers.
- `apps/storefront` — `src/**/*.test.ts` (view models, the catalog's facet and variant logic, the client scripts under
  happy-dom, the order-link request reader) and `scripts/**/*.test.mjs` (the seed's catalog, the bootstrap helpers). The
  storefront's Vitest is the only runner that collects `scripts/`, so write those tests with Vitest, not `node:test`
  (`.ai/memory/scripts-tests-run-under-the-storefront-vitest.md`).
- `packages/design-system` — `test` is the two lints above plus `node:test` for the lints themselves.

Rules (also in `AGENTS.md`): new or changed behaviour ships with a test that asserts what the consumer receives, and a
fixed bug gets a test that fails without the fix. Prove a new test by **mutation**: break the code on purpose, watch the
test fail, restore.

## End-to-end tests (Playwright)

The layout follows EmDash's own `e2e/` folder and the Cloudflare templates' Playwright setup: a root
`playwright.config.ts`, `e2e/tests/*.spec.ts`, helpers in `e2e/support/`, one worker (one server, one database).

```
playwright.config.ts          projects: smoke, purchase; no webServer (the setup owns the server)
e2e/global-setup.ts           what a run does before the first test (below)
e2e/support/                  config (targets), processes, server, stripe-cli, stripe-mode, a11y, checkout-page, dev-emails, ...
e2e/tests/*.spec.ts           home, shop, product, cart, redirects, orders, content, a11y, target   (project smoke)
e2e/tests/purchase*.spec.ts   purchase, purchase-cart                                      (project purchase)
e2e/tsconfig.json             strict, no `any`; typechecked by `pnpm typecheck` (Nx project `e2e`)
```

### What a run does

`pnpm test:e2e:smoke` and `pnpm test:e2e` start from nothing and leave nothing behind (about 40 seconds for smoke, about 75 with a Stripe key on a laptop):

1. Refuses to start when port **4380** (Cloudflare target: **4381**) already answers (a second server would make the suite test the wrong app). The
   dev server of `pnpm dev` is on 4360, so both can run side by side. `E2E_PORT` changes the port.
2. Deletes `.e2e/` (git-ignored) and creates a fresh one. **The server's state lives there**:
   `.e2e/data.db` and `.e2e/uploads/`, moved by two env overrides in `apps/storefront/astro.config.mjs`
   (`EMDASH_DATABASE_FILE`, `EMDASH_UPLOADS_DIR`; unset, the app still uses `data.db` and `uploads/` next to it). The
   suite never opens `apps/storefront/data.db`. Server, seed and Stripe CLI logs are in `.e2e/*.log`.
3. Decides whether this run has a Stripe sandbox (below). With a key it starts `stripe listen --forward-to
   localhost:4380/_emdash/api/plugins/stripe-commerce/webhook` itself and hands the server the CLI's own signing secret as
   `STRIPE_WEBHOOK_SECRET` (the secret differs per CLI login, so the suite asks the CLI with `stripe listen
   --print-secret` instead of holding a value).
4. Starts the storefront **dev server** (`astro dev`) on 4380 with a throwaway `EMDASH_ENCRYPTION_KEY`. It is the dev
   server on purpose: the seed signs in through the dev login, which exists only under `astro dev`. The `dev` script is
   not used, because it would load `apps/storefront/.env`.
5. Runs `scripts/seed-demo.mjs` against it. With a Stripe key the seed also syncs the catalog to Stripe and waits for it
   (about 40 seconds on a fast connection; `SEED_SYNC_TIMEOUT_SECONDS` is set to 540).
6. **Restarts the server once.** EmDash reads the site URL when it starts, and on an empty database the first seed is
   what stores it, so until a restart checkout answers `NOT_CONFIGURED`
   (`.ai/memory/emdash-site-url-is-read-at-startup.md`). This is also why there is no Playwright `webServer` block: it
   cannot restart a server halfway through its own setup.
7. Requests every page the specs open once, so Vite's first (slow) compile never lands inside a test.
8. Runs the specs. Afterwards (also after Ctrl-C or a failed setup) the server and `stripe listen` are stopped; their
   process groups are killed, and an `exit` handler is the safety net.

Because the database is rebuilt every run, nothing in the suite depends on what a previous run left behind. The Stripe
sandbox is the one thing that accumulates (Products, Prices, Customers, PaymentIntents); that is fine and harmless.

### Smoke suite: no secrets

`pnpm test:e2e:smoke` is `E2E_STRIPE=off playwright test --project=smoke`: the server runs **without any Stripe key**, whatever
your environment or `apps/storefront/.env` holds, and CI runs it that way. What it covers:

| Spec | Asserts |
| --- | --- |
| `home` | hero, category pills (links to `/shop?category=`), a product rail, header menu, search and cart link |
| `shop` | all 20 seeded products and a count line equal to the cards; the category bar; the filter dialog (open, pick a brand, "Show N results" updates, the URL carries `?brand=`, the applied chip removes it); a filtered URL opened directly |
| `product` | size and colour change the price and the SKU; a size that does not exist in a colour is disabled; a sold-out product cannot be added; an unknown slug is a 404 page |
| `cart` | add to cart; the line, the subtotal; remove; the empty cart (see "what degrades") |
| `redirects` | `/shop/c/<category>` and `/shop/brand/<brand>` answer 301 to the filtered shop, an unknown slug is a real 404 with the not-found page |
| `orders` | `/orders/view` with a bad, missing or oversized token is a 404 page with a link to `/orders/lookup`, `Cache-Control: no-store`, `Referrer-Policy: no-referrer` and a `noindex` robots meta; the lookup form shows the same generic notice for a real-looking and a fake number, the API answers identically, and the form still works without JavaScript |
| `target` | the server's measured runtime is the one `E2E_TARGET` asked for (`node` or `workerd`) and `/shop` answers |
| `content` | `/posts` and a post, `/search` (a hit and "no results"), `/rss.xml` |
| `a11y` | axe-core (WCAG 2.x A and AA), serious and critical violations fail, on home, shop, a product page, the cart and the order lookup at 1280 px and at a 390 px phone viewport |

**What degrades without a Stripe key.** The catalog is never synced to Stripe, so no price has a Stripe id. The plugin still
puts the product in the cart (the cart is its own storage), but marks the line "This item is not ready for checkout yet.",
and the page keeps the quantity stepper and the **Checkout** button disabled; the line can still be removed. Anything that
creates a Checkout Session answers `NOT_CONFIGURED`. So the smoke run asserts exactly that, and the quantity change and
the checkout live in the purchase suite. When you run the whole suite with a key, the keyless cart assertions skip
themselves (the catalog is synced then).

### Purchase suite: needs a Stripe sandbox

`e2e/tests/purchase*.spec.ts`, project `purchase`. Prerequisites:

- A **sandbox** key, `sk_test_...` or `rk_test_...`. The suite reads `STRIPE_SECRET_KEY` from the environment, and falls back
  to `apps/storefront/.env` (what `pnpm bootstrap` writes). **A key of any other shape is refused: the run stops with an
  error** (a live key never reaches the server). A restricted key needs the permissions listed in
  [getting-started.md](getting-started.md#2-a-stripe-sandbox-and-its-keys).
- The [Stripe CLI](https://docs.stripe.com/stripe-cli) on the `PATH`. The suite passes the key to the CLI as
  `STRIPE_API_KEY` (so it is never on a command line), which makes the CLI use the account of the key; no `stripe login` is
  needed.

When either is missing the purchase specs **skip themselves** and the setup prints why (`[e2e] Stripe: off. ...`).

What it does: add a sticker pack to the cart, press **Checkout**, fill Stripe's hosted page (card 4242 4242 4242 4242, USD
when the page offers adaptive pricing), land on the success page (`checkout-status` says paid, `checkout-order-number`
is an `ORD-YYYY-NNNNN`), read the confirmation from EmDash's in-memory dev mailbox (`GET /_emdash/api/dev/emails`, after
the dev login `GET /_emdash/api/auth/dev-bypass`), open the emailed `/orders/view?token=...` link (order number, payment
"Paid", the line, the total, no-store and no-referrer), and show that **one changed character of the token is the 404
page**. A second test asks for a new link through `/orders/lookup` and the plugin route (`orders/access-link`): the notice
and the API answer are identical for the real order and for a made-up one, but only the real one produces an email. A
third checks the quantity stepper and the subtotal against the synced catalog. Every run uses new buyer emails.

### The Cloudflare target

`E2E_TARGET=cloudflare` (vocabulary `E2E_TARGETS` in `e2e/support/config.ts`; unset is `node`) runs the **same specs** against
the storefront on **workerd**, the runtime of the Worker target (`docs/cloudflare.md`). `pnpm test:e2e:smoke:cloudflare` is the
keyless smoke project, `pnpm test:e2e:cloudflare` everything (the purchase part needs the sandbox key and the Stripe CLI, as
on Node). The decision and the alternatives: `.ai/decisions/2026-11-17-e2e-cloudflare-target.md`.

What differs from a Node run (everything else in "What a run does" is the same):

| | Node | Cloudflare |
| --- | --- | --- |
| Server | `astro dev` | `DEPLOY_TARGET=cloudflare astro dev` (the Cloudflare adapter runs the app in a `workerd` child; `import.meta.env.DEV` stays true, so the dev login the seed needs works) |
| Port | 4380 | **4381** (`E2E_PORT` still overrides) |
| State | `.e2e/` (`data.db`, `uploads/`) | `.e2e-cloudflare/` (ignored by version control; deleted every run): local D1, R2, KV and Durable Object state in `.e2e-cloudflare/state`, set with `EMDASH_CLOUDFLARE_STATE_DIR` in `apps/storefront/astro.config.mjs` (the adapter's `persistState.path`). `apps/storefront/.wrangler/state`, the developer's own local Cloudflare data, is never opened. |
| Secrets | process environment | workerd does not see the process environment. The setup writes `apps/storefront/.dev.vars.e2e` (mode 600, ignored by version control, deleted by the teardown) and starts the server with `CLOUDFLARE_ENV=e2e`, so wrangler reads that file and **not** the storefront's `.env` or `.dev.vars` (which hold the developer's keys: a keyless smoke run stays keyless). Wrangler prints `No environment found in configuration with name "e2e"`; it is harmless. |
| Webhook secret | `STRIPE_WEBHOOK_SECRET` in the server's environment | stored as the plugin's encrypted setting through `PUT /_emdash/api/admin/plugins/stripe-commerce/settings` (what "Register webhook" does on a deployed site), because `wrangler.jsonc` declares `secrets.required` and wrangler then forwards only the required ones to the Worker: a `STRIPE_WEBHOOK_SECRET` in `.dev.vars` is dropped and every webhook answers 503 (`.ai/memory/wrangler-passes-only-required-secrets-to-the-worker.md`) |
| Time | about 55 s for smoke | about 2.2 minutes for smoke, about 3 minutes with the purchase suite (workerd is slower to compile and to answer; the Stripe sync is the same) |

**The target is measured, not assumed.** After the warm-up the setup looks at the server's process group: a `workerd` process in
it means the Worker runtime, none means Node. `e2e/tests/target.spec.ts` asserts that the measurement matches `E2E_TARGET`, so a
switch that silently started the wrong server fails that spec instead of passing everything on the wrong runtime. Proven by
mutation: making the Cloudflare target start the Node server fails it (`Expected: "workerd"`, `Received: "node"`).

**Nothing is skipped because of the target.** All 41 smoke tests pass on both targets; the 4 skipped ones are the known
accessibility `test.fixme` cases on both. The purchase suite passes on both (3 tests: cart quantity, the purchase with the emailed
link, the lookup-page link).

What the Cloudflare run does **not** cover: it is `astro dev` on workerd, so it is not the built Worker (`import.meta.env.DEV` is
true, the dev login and the in-memory dev mailbox exist, which a deployed Worker does not have), not a real D1 or R2 (local
emulation), not a deployed domain, passkeys or an email provider. The built bundle is only covered by `pnpm build` and the
by-hand check in `docs/cloudflare.md`.

CI: the `smoke-cloudflare` job runs on every pull request and push, beside `smoke`; the weekly purchase job runs the purchase specs on
both targets, one after the other.

### Commands and variables

| | |
| --- | --- |
| `pnpm test:e2e:install` | `playwright install chromium` (once, and after a Playwright upgrade; in CI with `--with-deps`) |
| `pnpm test:e2e:smoke` | smoke, keyless |
| `pnpm test:e2e` | everything; the purchase part when a sandbox key and the CLI are there |
| `pnpm test:e2e:smoke:cloudflare` · `pnpm test:e2e:cloudflare` | the same on the Cloudflare target (workerd): keyless smoke · everything |
| `pnpm exec playwright test <file or -g title>` | one spec; add `--headed` or `--ui` to watch it; add `E2E_STRIPE=off` for a keyless server |
| `pnpm exec playwright show-report` | the HTML report of the last run |

| Variable | Effect |
| --- | --- |
| `E2E_STRIPE=off` | start the server without a Stripe key, ignore the environment's key (the smoke script sets it) |
| `STRIPE_SECRET_KEY` | the sandbox key; wins over `apps/storefront/.env` |
| `E2E_TARGET` | `node` (default) or `cloudflare`: the runtime the server starts on (the scripts `test:e2e:cloudflare` and `test:e2e:smoke:cloudflare` set it) |
| `E2E_PORT` | the port of the suite's server (default 4380, Cloudflare 4381) |
| `E2E_CHROME_PATH` | a Chrome or Chromium binary to use instead of Playwright's download |
| `CI` | `forbidOnly`, and the `github` reporter |

Reading a failure: the list reporter prints the assertion; every failed test keeps a **trace** and a screenshot in
`test-results/<test>/`. Open the trace with `pnpm exec playwright show-trace test-results/<test>/trace.zip`: it is a timeline
of every action with a DOM snapshot before and after, the network calls (the plugin's API answers are there) and the console.
If the page itself is the suspect, the server's own log is `.e2e/server.log`. In CI the report, the traces and the server
logs are uploaded as an artifact when a job fails (the Stripe CLI log is left out: it prints the webhook secret).

### Writing and keeping the specs reliable

- Locate by role, label and the `data-testid` hooks (`add-to-cart`, `cart-line`, `cart-subtotal`, `cart-checkout`,
  `checkout-status`, `checkout-order-number`, `order-lookup-email|number|submit|notice`); assert with web-first
  `expect(locator)...` and never with a fixed `waitForTimeout`. There are **no retries**: a test that needs one is fixed.
- After adding to the cart, wait for the header bubble (`addToCartFromProductPage` does): the client script stores a new cart's
  cookie after the plugin answers, and a navigation in between shows an empty cart (the race workerd's slower answers exposed;
  `.ai/memory/add-to-cart-response-is-not-the-cart-cookie.md`).
- Scope cart locators to `main`: the mini-cart dialog in the header renders the same cart-line component, and appears a
  moment after load.
- Seed data is asserted by value (20 products, brand "Edge Desk" has 5) in `e2e/support/catalog.ts`; a changed seed should
  fail the suite loudly.
- `data-*` attributes do not pass through every design-system component (`InlineNotice` drops them), so a hook that does
  not reach the DOM is put on a wrapper.
- Phone checks use Playwright's `viewport` (CDP emulation), never a small window: headless Chrome lays out at about 500 px
  whatever `--window-size` says (`.ai/memory/headless-chrome-window-size-floor.md`).
- A new spec is proven by mutation, like any test: break the page or the code on purpose, see the spec fail, restore.

### Known issues the suite documents

Left out of the page checks, kept as `test.fixme` in `e2e/tests/a11y.spec.ts` with the reason, so they run again once fixed.
Both are in `packages/design-system`:

- A sold-out product card dims its title with `opacity: 0.6`: colour contrast below 4.5:1 (axe `color-contrast`, serious).
- A cart line that is not ready for checkout is dimmed with `opacity: 0.55`: the same.

Smaller things seen and not asserted: the cart badge's spoken text for one item is "1 items in the cart" (the label
template has no singular form), and the quantity stepper's two buttons share the accessible name "Quantity" in the cart.

## Where each kind of bug is caught

| The bug is in | First caught by |
| --- | --- |
| a plugin service (amounts, idempotency, webhooks) | plugin-stripe Vitest |
| a storefront view model or client script | storefront Vitest |
| a raw colour or size, a shadow, a local `filter` | `pnpm nx test design-system` |
| a wrong type across the plugin/storefront seam | `pnpm typecheck` |
| two correct pieces that do not fit (a page, a route, a script and the plugin API) | the smoke suite |
| Stripe, the webhook, the emailed link | the purchase suite |
