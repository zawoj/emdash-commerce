# EmDash (`apps/storefront`) — getting changes to a deployed site

`apps/storefront` is a demo app and this repository does not deploy it. This page records how EmDash 1.5 moves a local site to
production (from its documentation), and the rules for an agent doing it. The decision is in
`.ai/decisions/2026-11-12-emdash-agent-schema-changes-over-mcp.md`.

## What a deploy does and does not ship

| Moves with a deploy | Does not move |
| --- | --- |
| Code, templates, config, the EmDash version | Collections and fields created later (they live in the database) |
| On the **first** deploy only: the schema and structure of `seed/seed.json` | Content and media |
| EmDash's own core migrations (applied on the first request, or by `emdash migrate`) | Users, sessions, tokens, plugin settings, `EMDASH_ENCRYPTION_KEY` |

There is no one-command or one-click local → production deploy. Build and ship with `pnpm build` and
`pnpm wrangler deploy` (Cloudflare) or the Node/Docker flow. Editing `seed/seed.json` later does nothing to an existing
database, and production is the source of truth for the schema once it is live.

## Moving schema, content and media

- **Schema, after launch:** the Content Types screen on the deployed site, or `emdash schema add-field <collection>
  <slug> --type <type> --url https://<site> --token …`, or the site's MCP (below). Add first, then deploy the code that
  uses it; remove only after the code stopped using the field. The commands are not idempotent.
- **Whole site to a new, empty site:** `emdash site export` then `emdash site import … --analyze` and `--plan … --confirm`
  (`.emdash` package: model, entries, media files, menus, redirects; no users or secrets). An import into a site that
  already has content is refused.
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

- `seed/seed.json` contains the `feedback` collection (the Notes dev tool) — leave it out of the production seed.
- The `home` collection (intro image of the home page) is needed on production; its entry is content, so it is created
  there (the seed sample content is only applied if an admin picks it in the setup wizard).
- Set `EMDASH_ENCRYPTION_KEY` in the environment (`wrangler secret put …` or `emdash secrets generate`) and finish the
  setup wizard on the production domain straight away: the first person through it becomes the administrator.
- Passkeys work only on the hostname that created them; email sign-in needs an email provider (SMTP or the Cloudflare
  email plugin); sandboxed plugins on Cloudflare need the Workers Paid plan.
