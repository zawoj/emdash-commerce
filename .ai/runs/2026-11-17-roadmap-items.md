# Implement the roadmap "Next" items with parallel agents

Agent: Claude Code (Opus 5.5 orchestrating, Sonnet 5.5 streams) · Branch/PR: `t3/implement-roadmap-items` / not opened

## Goal
Implement what `ROADMAP.md` listed under "Next" (as of `f31643d`): one-click Deploy to Cloudflare, production seeding, npm
organisation and first release, email on deployed sites, production `seed.json` hygiene, Playwright on the Cloudflare target and
the four colour-contrast `test.fixme` cases.

## Steps
1. **Plan (parent).** Read the roadmap, `docs/cloudflare.md`, `docs/production.md`, the e2e setup and EmDash 1.5's dist (SMTP
   provider, API tokens). Split into five independent streams, each with its own ports so they could run at once (4362–4366
   dev and built servers, 4380/4381/4382/4383 e2e). The npm item needs the owner (organisation, `NPM_TOKEN`), so the parent only
   checked readiness. Streams could not edit `ROADMAP.md`, `README.md` or the root `CHANGELOG.md`; the parent reconciled them.
2. **Wave (parallel, one worktree each, Sonnet 5.5):**
   - A, Cloudflare template: `scripts/template/`, `pnpm template:cloudflare`, workflow `cloudflare-template.yml`, ADR.
   - B, seeding and seed hygiene: token auth in `pnpm seed`, `pnpm catalog:resync`, `seed/dev-tools.json`, export/import
     path tried between two local sites, ADR.
   - C, email: `docs/email.md`, an SMTP check in `pnpm run doctor`, `.env.example` placeholders, a real sandbox purchase over a local
     SMTP sink, ADR.
   - D, Cloudflare e2e: `E2E_TARGET`, throwaway state through `EMDASH_CLOUDFLARE_STATE_DIR`, a workerd target check, a CI job, ADR.
   - E, contrast: `product-card` and `cart-line` fade only the photo and use `--text-secondary`; the fixme cases became real tests.
3. **Merge (parent)** with `--no-ff` in the order E, D, C, B, A. The conflicts were in `.ai/memory/MEMORY.md` (kept both
   sides), `docs/cloudflare.md`, `docs/production.md`, `apps/storefront/.env.example` and `.gitignore` (kept both sides).
4. **Reconcile (parent).**
   - C and D had each written a memory about wrangler dropping optional secrets; they are merged into one file.
   - C found that bare `pnpm doctor` is pnpm's builtin; every mention is now `pnpm run doctor`.
   - The template stopped copying `seed/dev-tools.json`, and its README now points to token seeding and email setup.
   - Added a design-system changeset for the contrast fix, updated README and ROADMAP, and wrote one CHANGELOG entry.
5. **Cold-start crash (D, second pass).** On the merged branch, the first `pnpm test:e2e:smoke:cloudflare` run on a cold Vite
   cache crashed. Vite's optimizer found `@astrojs/react/server.js` late, reloaded, and workerd asked for a deps file that no
   longer existed. C and D had each seen this once. CI always starts cold, so stream D was sent back to fix the cause.
   It found three late dependencies (`@astrojs/react/server.js`, `stripe`, `astro/container`) and pre-bundles them in the
   Cloudflare SSR environment's `optimizeDeps.include` (`.ai/memory/cloudflare-dev-cold-cache-reoptimize.md`).

## Follow-up pass (same day, after the owner asked to fix the remaining items and run them)
- Accounts: npm was logged in as another user (`payloadjs`) and the `@emdash-commerce` organisation does not exist; npm creates
  organisations on the website only, so the release stays with the owner. Wrangler was not logged in; a request for a Cloudflare
  API token timed out. GitHub (admin, no branch protection) was available.
- Fixed in parallel streams: site import into a fresh shop (`COMMERCE_DEFER_RELATIONS`), the duplicated cart-line warning and the
  plural counts; email verified with Mailpit (owner's choice; a deployed Worker cannot reach a local Mailpit); a real deploy tried on
  a `--temporary` account (blocked: R2 forbidden, 5 MiB asset cap; nothing left behind, no Stripe webhook was created).
  Separate logs: `2026-11-17-mailpit-delivery.md`, `2026-11-17-cloudflare-temporary-account-deploy.md`.

## After merge (#9)
- `cloudflare-template.yml` on `main` (run 44174274182): generate, install, build, dry-run, publish all passed; the orphan
  branch `cloudflare-template` exists (commit `Generated from zawoj/emdash-commerce@7d2c15d`).
- `release.yml` failed: Actions were not allowed to create pull requests. Turned on "Allow GitHub Actions to create and approve
  pull requests" through the API (`can_approve_pull_request_reviews: true`, `default_workflow_permissions` stays `read`; a PUT
  with `-F` form fields returned 204 and changed nothing, a JSON body worked) and re-ran it: "Version Packages" is #10, not merged.

## Verification
On the merged branch:
- `pnpm check:ai`, `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm test` and `pnpm build` all pass.
- `pnpm test:e2e:smoke`: 45 passed, 0 skipped (the old contrast `fixme` cases are real tests now).
- From a deleted Vite cache: `pnpm test:e2e:cloudflare` (smoke and purchase, with a sandbox key and Stripe CLI 1.40.3) gave
  42 passed, 4 skipped (the cases that only apply with or without a key) and 1 failed. The failure: the hosted-Checkout purchase
  timed out after pressing Pay, with the Stripe form filled. No `checkout.session.completed` reached the server; every
  forwarded webhook answered 200. On a re-run the purchase project passed on both targets (Cloudflare 3/3, Node 3/3). Stream D
  saw the same stall once, so it is an intermittent stall on Stripe's hosted page, cause not found. The cold server log
  showed 0 late "dependency optimized" lines.
- The three packages pass `pnpm publish --dry-run`. `npm view @emdash-commerce/plugin-stripe` finds nothing, so nothing is
  published.
- Each stream also verified its own work:
  - A: generated the copy outside the monorepo, then install, typecheck, build, `wrangler deploy --dry-run`; `/` and `/shop`
    answered 200 under `wrangler dev`.
  - B: on a built server, with no dev login, the token seed completed with Stripe `due: 0`, idempotent on a re-run; a token
    without the needed scopes was refused before any write; an export → import → resync between two local sites worked.
  - C: a sandbox purchase sent both emails over SMTP to a local sink, and the order link opened.
  - D: Cloudflare smoke and purchase suites passed, and the workerd target check was proven by mutation.
  - E: mutation (opacity restored) failed 8 a11y tests.

## Outcome
Partial: done in code and verified locally (`pnpm check:ai`, lint, typecheck, test and a no-cache build re-run green after the last merge). The npm organisation and first release are owner steps, and nothing was run
against a real Cloudflare account.

## Follow-ups
- Owner: create the npm organisation and `NPM_TOKEN`, then run the release.
- Owner: run `cloudflare-template.yml` on `main` once and press the Deploy button with a real account. If branch protection
  covers all branches, exempt `cloudflare-template`.
- Try the token seed, D1 import and SMTP delivery from a deployed Worker.
- `emdash site import` into a fresh shop: fixed by `COMMERCE_DEFER_RELATIONS` (follow-up pass); a shop started without it still needs the `DELETE` or a fresh database.
- On a deployed Worker, whether a secret set with `wrangler secret put` but not listed in `secrets.required` reaches the
  Worker was not tested (`.ai/memory/wrangler-passes-only-required-secrets-to-the-worker.md`).
- The hosted-Checkout Pay step sometimes stalls past the 90 s wait (2 of about 5 Cloudflare purchase runs, none seen on Node).
  If the weekly job shows it, capture a trace and look at Stripe's side (adaptive currency selector, card-field focus).
- Fixed in the follow-up pass: the duplicated cart-line warning and the singular cart count.
