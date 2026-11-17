# EmDash (`apps/storefront`) — getting changes to a deployed site

`apps/storefront` is a demo app and this repository does not deploy it. This page records how EmDash 1.5 moves a local site to
production (from its documentation), and the rules for an agent doing it. The decision is in
`.ai/decisions/2026-11-12-emdash-agent-schema-changes-over-mcp.md`.

**Cloudflare:** the storefront has a Workers + D1 + R2 target (`DEPLOY_TARGET=cloudflare`); the step-by-step guide, the secrets
(`EMDASH_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`), the webhook registration and its limits are in `docs/cloudflare.md`. This page
stays the reference for what a deploy does and does not move, and for an agent changing a deployed site. Any other host
(Node, Docker) is the Node target and is not covered by this repository.

## What a deploy does and does not ship

| Moves with a deploy | Does not move |
| --- | --- |
| Code, templates, config, the EmDash version | Collections and fields created later (they live in the database) |
| On the **first** deploy only: the schema and structure of `seed/seed.json` | Content and media |
| EmDash's own core migrations (applied on the first request, or by `emdash migrate`) | Users, sessions, tokens, plugin settings, `EMDASH_ENCRYPTION_KEY` |

There is no one-command or one-click local → production deploy (the Deploy to Cloudflare button cannot deploy this
monorepo as it stands: `docs/cloudflare.md`). Build and ship with
`pnpm --filter @emdash-commerce/storefront deploy:cloudflare` (Cloudflare) or the Node/Docker flow (`pnpm build`). Editing `seed/seed.json` later does nothing to an existing
database, and production is the source of truth for the schema once it is live.

## Moving schema, content and media

- **Schema, after launch:** the Content Types screen on the deployed site, or `emdash schema add-field <collection>
  <slug> --type <type> --url https://<site> --token …`, or the site's MCP (below). Add first, then deploy the code that
  uses it; remove only after the code stopped using the field. The commands are not idempotent.
- **Whole site to a new, empty site:** `emdash site export` then `emdash site import … --analyze` and `--plan … --confirm`
  (`.emdash` package: model, entries, media files, menus, redirects; no users or secrets). An import into a site that
  already has content is refused. For this shop it needs one extra step and a resync: see "Seeding a deployed site" below.
- **Single items:** `emdash content create … --url …` and `emdash media upload …`.
- **Seed:** `emdash seed` applies to local SQLite only (not D1/R2). Use `emdash export-seed` from a copy of production
  to keep `seed/seed.json` in line with the live model.
- **Core migrations:** automatic on the first request. For a big Cloudflare site, or to control the moment, run
  `emdash migrate --status`, `emdash migrate --expected-target-fingerprint …`, deploy, `emdash migrate --check`.
  Forward only, no rollback.

## An agent changing a deployed site over MCP

1. **Token:** in the deployed admin, Settings → API Tokens, create a personal access token (`ec_pat_…`) with only the
   scopes the task needs and a short expiry; delete it when the task is done.

   | Task | Scopes |
   | --- | --- |
   | Read the live schema | `schema:read` |
   | Add a collection or field | `schema:read`, `schema:write` |
   | Fill it with content | add `content:read`, `content:write` |

2. **Connect** (your own Claude Code config, not the repo; the token comes from your shell):

   ```bash
   claude mcp add --transport http --scope local emdash-staging \
     https://<staging-host>/_emdash/api/mcp --header "Authorization: Bearer $EMDASH_STAGING_TOKEN"
   ```

   Use a separate entry (and token) for production. Without MCP, the same changes work with the `emdash` CLI and
   `--url`/`--token`.
3. **Order of work:** `schema_list_collections` / `schema_get_collection` first; say which calls you will make; staging
   before production; a person approves production; then check the site and mirror the change in `seed/seed.json`.
4. **Agent may:** create collections and fields, write content. **A person does:** removing fields or collections,
   permanent deletes, `emdash migrate`, site import. There is no rollback and a removed field loses its values.
5. **Back up first** on Cloudflare: D1 Time Travel (7 days on the free plan, 30 on paid). It overwrites in place and does
   not restore R2 media or the encryption key.

What was checked locally (2026-11-12, `localhost:4360`): a bearer token reaches the MCP; calls are refused with
`INSUFFICIENT_SCOPE` when the token lacks the scope (a read-only token could not create a collection; a schema-only token
could not read content); no token gives 401; `tools/list` returns all 72 tools whatever the token. Not checked: a deployed
site, Cloudflare, or Claude Code's `--header` flag against EmDash.

## Before the first deploy

- `seed/seed.json` is the production seed: it has no `feedback` collection (the Notes dev tool; its definition is in
  `seed/dev-tools.json`, applied only by `pnpm seed` against a dev server). Nothing to remove. A site exported from a dev
  database that ran `pnpm seed` does carry `feedback`; delete that collection after an import.
- The `home` collection (intro image of the home page) is needed on production; its entry is content, so it is created
  there (the seed sample content is only applied if an admin picks it in the setup wizard).
- Set `EMDASH_ENCRYPTION_KEY` in the environment (`wrangler secret put …`; generate it with `emdash secrets generate`: the
  format is `emdash_enc_v1_` + 43 base64url characters, `.ai/memory/emdash-encryption-key-format.md`) and finish the
  setup wizard on the production domain straight away: the first person through it becomes the administrator.
- `pnpm seed` can seed a deployed site with an access token instead of the dev login ("Seeding a deployed site" below). Or
  create the catalog in the admin or over MCP, or import a local site (`docs/cloudflare.md`, step 6).
- Passkeys work only on the hostname that created them; email sign-in and the shop's order emails need an email
  provider (Settings → Email: SMTP or a provider plugin; none is active on a fresh deploy: [email.md](email.md)); sandboxed plugins on Cloudflare need the Workers Paid plan.

## Seeding a deployed site

The deployed site has no dev login, so `pnpm seed` authenticates with a personal access token. Decision and alternatives:
`.ai/decisions/2026-11-17-production-seeding.md`.

**Prerequisites.** The setup wizard is finished (a person does it with a passkey: `docs/cloudflare.md`, step 3; the seed stops
and says so while `/setup/status` still answers `needsSetup`), the schema is there (the first deploy applied `seed/seed.json`),
a Stripe **sandbox** key is configured on the site (the sync refuses a live key by design), and you hold a token.

1. In the deployed admin: Settings, API Tokens, create a token. Scope **`admin`** is the simple choice (it grants every scope)
   and is required for the part that drives the Stripe catalog: the plugin's `admin/*` routes check the `admin` scope and the
   `plugins:manage` permission of the token's user. The finer list the seed asks for: `content:read`, `content:write`,
   `media:read`, `media:write`, `settings:manage` (site title and tagline) and `admin`. Give it a short expiry and delete it afterwards.
2. From your machine (the token goes only into a header and is never printed; an `http://` URL other than localhost is refused):

   ```bash
   EMDASH_URL=https://<your host> EMDASH_TOKEN=ec_pat_… pnpm seed
   ```

   Before writing anything it probes each needed scope with a request that changes nothing, and stops with exit code 1 naming
   the missing scopes. It then creates vocabulary, brands, categories, products with variants and prices, the bundles and the
   membership, uploads the art, fills the Homepage (creating the `home` entry when the site has none) and ends by queueing the
   catalog resync and driving `admin/catalog/sync` until `due` is 0 (exit code 1 on a timeout or failures). `--only site,home,…`
   limits it.
3. **Re-running** is safe: everything is matched by slug or name and updated in place. It also **overwrites** edits an editor
   made in the admin to those same products, and it re-queues the whole catalog for Stripe. Use `--only` to avoid that.
4. `EMDASH_TOKEN` unset keeps the old behaviour (dev login, local dev server; this path also creates the dev-only `feedback`
   collection). With a token it never calls a dev route and never creates `feedback`.

`pnpm catalog:resync` (same `EMDASH_URL` / `EMDASH_TOKEN`, scope `admin`) runs only the resync step.

### Export / import instead

For a catalog already built on another site (a seeded local site, staging). The CLI reads `EMDASH_URL` and `EMDASH_TOKEN` from the
environment: use that rather than `--token`, which lands in your shell history and process list.

```bash
# source site (token scope transfer:export, or admin)
emdash site export --output site.emdash
# target: an empty site with the setup finished (token: transfer:analyze + transfer:execute, or admin)
emdash site import site.emdash --analyze        # prints the plan and its planDigest
emdash site import site.emdash --plan <planDigest> --confirm
pnpm catalog:resync                              # mandatory afterwards
```

- **The resync is mandatory.** An export carries content and media, not the Stripe ids: they live in the plugin's storage
  (`catalog_links`). After an import `catalog/sync` answers `due: 0` while nothing is in Stripe, so the shop looks fine and
  checkout fails with NOT_SYNCED until `pnpm catalog:resync` has run.
- **A fresh shop is not "empty" for the importer.** The commerce plugin creates 19 relation definitions (`_emdash_relations`)
  on a new site, and EmDash 1.5 counts any row there as content: `--analyze` answers `TRANSFER_TARGET_NOT_EMPTY`. The import
  brings the relations back (the package counts 19). Locally the way through was `DELETE FROM _emdash_relations;` on the
  target SQLite database before the analyze. On D1 that would be
  `wrangler d1 execute <db> --remote --command "DELETE FROM _emdash_relations"` (**not tried**; back up first). It is an
  interaction of the plugin and EmDash, reported as a follow-up, not changed here.
- The export includes every collection of the source (`feedback` too when it ran `pnpm seed`) and the author principal.
- Run on 2026-11-17, locally: source = a dev server seeded with `pnpm seed` (3.2 MiB package, 86 files), target = the built
  Node server on another port with its own throwaway SQLite database (the admin token was `admin`). Analyze passed after the
  relation delete, confirm imported 180 entries and 65 media with receipt `verification: verified`, `/shop` rendered with
  images, `pnpm catalog:resync` synced the catalog. Not run: D1/R2, a remote host, `--map-principal`, the `transfer:*` scopes alone.

### What was verified for the token seed

2026-11-17, Node 24.22.1, a **built** server (`astro build`: no dev routes, `GET /auth/dev-bypass` answered 403) on a fresh SQLite
database whose setup was finished once through a dev server (the only way without a passkey), Stripe sandbox key. The database
path is fixed at build time: build with `EMDASH_DATABASE_FILE` / `EMDASH_UPLOADS_DIR` set (`.ai/memory/emdash-node-build-bakes-the-database-path.md`).

- A token with only `content:*` and `media:*`: the seed stopped before writing and named `settings:manage, admin`. With `admin` it
  completed: 20 products, 51 variants, 67 prices, a Homepage with 5 look points and 3 callouts, `stripe: catalog synced`,
  `catalog/sync` then answered `due: 0`, no `feedback` collection, `/shop` 200. A second run completed too.
- A logging `fetch` wrapper over the second run: 263 requests, none to a `dev-bypass` route, every request except the public
  `/setup/status` carried the bearer header, none carried a cookie.
- Against a dev server (no token) `pnpm seed` created the `feedback` collection and finished.
- Not verified: a deployed host, D1/R2, a live-mode Stripe account (the sync refuses it), whether the scopes beyond those two
  tokens are the minimal set.
