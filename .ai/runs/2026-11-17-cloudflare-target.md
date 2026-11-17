# A Cloudflare (Workers + D1 + R2) target for the storefront, and a spike on the commerce plugin

Agent: Claude Code (implementation sub-agent, Sonnet 5.5) · Branch: t3/05b7f3fc (worktree, not pushed) · Task: none (asked by the lead session, "Phase 3")

## Goal
Run this storefront on Cloudflare as well as Node (one app, an env switch), find out whether the Stripe plugin runs on
workerd, verify as far as possible without a Cloudflare account, and document the deploy, the secrets and the Deploy button.

## Steps
1. Read AGENTS.md, the storefront AGENTS.md, `docs/production.md`, the memory index and the plugin entries; read the EmDash
   `starter-cloudflare` / `blog-cloudflare` templates and `demos/cloudflare/README.md` through `gh api`, and the
   `cloudflare/templates` CONTRIBUTING.md and the Deploy button docs.
2. Checked versions: `@astrojs/cloudflare` 14.3.4 (peer `astro ^7.2.0`; 14.4+ need Astro 7.4), `@emdash-cms/cloudflare` 1.5.0,
   `wrangler` ^4.163, `@cloudflare/workers-types`. Added them with pnpm.
3. `astro.config.mjs` switch (lazy imports), `wrangler.jsonc`, `src/worker.ts`, `wrangler types`, scripts, `.gitignore`,
   `.dev.vars.example`, the `cloudflare` metadata block. Found that the generated types clash with DOM types (17 errors) and
   split the typecheck (`tsconfig.cloudflare.json`).
4. Audited the plugin and the storefront for Node-only APIs: none. Wrote a guard test and proved it with four mutations; wrote
   a config-agreement test for `wrangler.jsonc` / `astro.config.mjs` / `package.json` and proved it with five mutations.
5. Verified on workerd (details in `docs/cloudflare.md`): build, `wrangler deploy --dry-run`, `astro dev` + seed + browse + a
   sandbox purchase through the Playwright reference script with `stripe listen`, then the same purchase and the cron on the
   built Worker under `wrangler dev`.
6. Wrote `docs/cloudflare.md`, updated `docs/production.md`, the ADR and four memory files.

## Verification
- `DEPLOY_TARGET=cloudflare` build: ok. `wrangler deploy --dry-run`: accepted, bindings listed.
- workerd (`astro dev`, local D1/R2): schema reconciled, `pnpm seed` incl. Stripe sync of 75 entities, `/shop` 200, purchase paid
  (ORD-2026-00001), webhook `[200]` for each event.
- Built Worker (`wrangler dev`): `/shop` 200, purchase paid (ORD-2026-00002), cron ran the plugin's maintenance task.
- Gate (Node target, no env): see the final report of the session; `pnpm check:ai`, `typecheck`, `test`, `build`.

## Outcome
Done on the branch, committed locally, not pushed. No Cloudflare account was touched (no login, no real deploy).

## Follow-ups
- The Deploy button cannot deploy this monorepo subdirectory; a standalone template repo (vendored or published packages) would.
- `pnpm seed` cannot seed a deployed site (dev login); a token-based seed or `emdash site import` is needed (scripts/ was out of scope).
- Not tried: a real deploy, passkey login, an email provider on Workers, Workers Builds with a root directory, behaviour under
  Workers CPU and subrequest limits, opening a guest order link on this target.
- Another process owned port 4391 (a Python static server); the run used 4397.
