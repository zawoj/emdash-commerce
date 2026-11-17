# Community release: orchestrated multi-agent run

Date: 2026-11-17 · Branch: `t3/feature-list-release-prep`

## Goal
Prepare the project for a community release on the EmDash Discord: fix what a feature audit found wrong, then align the
repository with the conventions of Cloudflare's official OSS repos (`emdash-cms/emdash`, `cloudflare/templates`,
`cloudflare/workers-sdk`) in one pull request. Scope decisions: `.ai/decisions/2026-11-17-community-release-scope.md`.

## Steps
1. **Run it locally and audit.** Node 24 through fnm, `pnpm install`, `.env` copied from the main checkout, `pnpm dev`, `stripe
   listen`, `pnpm seed`, `pnpm doctor`. The audit compared the README's feature list with the code and found: a hex
   `EMDASH_ENCRYPTION_KEY` that EmDash 1.5 rejects (bootstrap, doctor and docs all wrong), no page behind the order-email link,
   no routes for the plugin's `/shop/c/` and `/shop/brand/` URL patterns, a wrong MCP tool count.
2. **Fix and prove (parent, Claude Sonnet 5.5).** Key format, `/orders/view`, the two redirect routes, `OrderSummary`, docs;
   six mutations killed. A real sandbox purchase through Playwright produced a real order and a real emailed link, which exposed
   a layout bug the fixture had hidden (stale dev CSS cache, confirmed after a restart).
3. **Wave 1, parallel, separate worktrees:** repo hygiene and CI (Composer 2.5), cart/success/order-lookup pages (Composer 2.5),
   Changesets and publishing (Sonnet 5.5), Cloudflare target (Sonnet 5.5, effort high).
4. **Wave 2 after merging wave 1:** Playwright suite (Sonnet 5.5, effort high), README/ROADMAP/skills/docs (Composer 2.5).
5. **Merge** each branch with `--no-ff`; the only conflicts were the memory index and `pnpm-lock.yaml` (index entries kept from
   both sides; lockfile regenerated with `pnpm install`). Then the parent reconciled README, ROADMAP, AGENTS and CHANGELOG with the
   e2e suite, which the docs stream had been told did not exist yet.

## Verification (on the merged branch)
`pnpm check:ai`, `pnpm lint` (0 errors), `pnpm typecheck`, `pnpm test`, `pnpm build` all pass; `pnpm test:e2e` (smoke plus the
real Stripe-sandbox purchase): 41 passed, 6 skipped (4 `test.fixme` for colour contrast of reduced-opacity states, 2 keyless-only
cart tests). Frozen-lockfile install passes. A scan of the diff against `main` found no secret values and no runtime files.

## Outcome
One branch with community files, CI hardening, Changesets and publish-ready packages, a Cloudflare target, rebuilt storefront
pages, a Playwright suite, a README/ROADMAP/skills layer and the fixes from the audit.

## Follow-ups (owner)
- Create the npm organisation `@emdash-commerce`, add `NPM_TOKEN` and `STRIPE_SANDBOX_SECRET_KEY` repository secrets, enable
  "Allow GitHub Actions to create and approve pull requests".
- Decide on the demo brand (it still uses the Cloudflare name and palette) before the announcement.
- The Deploy to Cloudflare button cannot build this monorepo: publish the packages and create a standalone template copy, or use
  Workers Builds with root `apps/storefront` (untried).
- Not verified: a deploy to a real Cloudflare account, production email, Playwright on the Cloudflare target.
- Known a11y gaps that need design-system changes: cart badge "1 items", shared accessible name "Quantity" on the stepper
  buttons, duplicated warning on an unavailable line, contrast of reduced-opacity states.
