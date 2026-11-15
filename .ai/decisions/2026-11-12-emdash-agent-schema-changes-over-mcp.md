# EmDash: agents change a deployed site's schema through its MCP, with scoped tokens and a human gate

Task: none (agreed in the working session).

## Context

`apps/storefront` keeps its content model (collections, fields) in the database, not in the repo, and a deploy ships only
code and config; later schema changes, content and media do not travel with it (see `docs/production.md`).
There is no `emdash deploy` and no schema push. Each environment's schema is changed by acting on that environment: the
admin's Content Types screen, the `emdash` CLI with `--url`/`--token`, or the site's own MCP endpoint
(`/_emdash/api/mcp`, tools such as `schema_create_field` and `content_update`).

## Decision

An agent may apply schema and content changes to a **staging or production** EmDash site through that site's MCP
endpoint, under these rules:

1. **Scoped, short-lived tokens.** A personal access token (`ec_pat_…`, sent as `Authorization: Bearer …`) per
   environment and per task, with only the scopes the task needs (`schema:read` + `schema:write` for a field; add
   `content:write` only to fill it), never `admin`, with an `expiresAt`. Scopes are enforced when a tool is called
   (`INSUFFICIENT_SCOPE`); `tools/list` shows every tool whatever the token, so the list is not a permission check.
2. **Staging first.** The same change is applied and checked on a staging site with its own database before production.
3. **Additive only for an agent.** Creating collections and fields, and writing content, may be done by an agent.
   Removing a field or a collection, deleting content for good, core migrations (`emdash migrate`) and whole-site
   import need a person: they are destructive or cannot be undone, and EmDash has no rollback.
4. **A person approves production.** An agent states the exact calls it will make; a person says go. This sits on top of
   the repo rule that production is read-only unless told otherwise (`AGENTS.md`). The schema change also goes into
   `seed/seed.json`, so a new environment starts with it.
5. **Environment secrets stay out of the repo.** The MCP connection to a deployed site is registered in the user's own
   Claude Code config (`claude mcp add --scope local …`), never in `apps/storefront/.mcp.json`, which holds only the local
   site and the public docs server.

## Alternatives considered

- **Replay `emdash schema …` commands from a script in CI** (what the EmDash docs suggest). Reviewable and repeatable,
  and still allowed for a change set that is known up front; but the commands are not idempotent and CI needs a
  long-lived admin-ish token. MCP lets an agent inspect the live schema (`schema_get_collection`) before it writes.
- **Give the agent the admin role and a long-lived token.** Simpler, rejected: one leaked or misused token could drop
  fields on the live site.
- **Never let an agent touch a deployed site.** Safest, but then the agent can only describe changes and a person
  repeats them by hand.

## Consequences

- Checked locally on 2026-11-12 against `localhost:4360`: a token with `schema:read` and `content:read` could list
  collections but got `INSUFFICIENT_SCOPE` on `schema_create_collection`; a token with `schema:write` created and
  deleted a collection but got `INSUFFICIENT_SCOPE` on `content_list`; a request without a token got 401. Not tested
  against a deployed site, Cloudflare or Claude Code's `--header` flag.
- Token handling becomes part of the process: create, use, delete after the task, and never paste into the repo or a
  prompt.
- The `feedback` collection (dev tooling, in `seed/seed.json`) would be created on a first deploy; keep it out of the
  production seed.
