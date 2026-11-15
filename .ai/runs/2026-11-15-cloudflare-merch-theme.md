# Re-theme the demo shop to mock Cloudflare merch, with onboarding for people and AI agents

Agent: Claude Code (lead on Sonnet 5.5; two Sonnet subagents: art generator, design-system re-skin) · Branch/PR: t3/4e10e9d3 / none · Task: none (asked in the session)

## Goal
Swap the sportswear demo for fictional Cloudflare-style merch (more product kinds, bundles, a desk-setup look), recolour the
design system to the Cloudflare palette, add init steps for newcomers, and write the memo and README prompt that let an
AI agent learn the project.

## Steps
1. Mapped the theme surface: seed script, `seed.json`, home config and copy, shell copy, tokens, wireframe lint, docs.
2. Subagent A: `scripts/art/` generator and 59 committed PNGs. Subagent B: tokens, lint, contrast test, design-system docs.
3. Lead: `scripts/lib/merch-catalog.mjs` + seed rewrite, home rails and copy (en, pl), USD (`DEFAULT_CURRENCY`, plugin options,
   `en-US`), `bootstrap`/`doctor`, `docs/ai-guide.md`, README, AGENTS, getting-started, ADR, memory, changelogs.
4. Ran the dev server on a fresh database (no Stripe key), `pnpm seed`, screenshots of `/`, `/shop/packet-jacket`.

## Verification
`pnpm check:ai`, `pnpm typecheck`, `pnpm test` (storefront 269, plugin 1273, design system 67 incl. contrast), `pnpm build`
all green. Seed completed on an empty database: 20 products visible at `catalog/products`; `/`, `/shop`, product, bundle,
membership and category pages answered 200. Headless-Chrome screenshots of home and a product page checked by eye; a
spotlight callout overlap was found and fixed (zip callout on the left). `pnpm bootstrap --yes` exercised without the Stripe CLI.

## Outcome
Done, uncommitted. Not exercised: a Stripe sandbox sync and checkout (no key used), the admin UI, mobile widths, the
interactive `pnpm bootstrap` prompt, the Stripe CLI webhook-secret path, SVG upload rejection.

## Follow-ups
- Blog pages were not audited against the new palette.
- `welcome-kit` and `desk-setup-bundle` art are dense compositions; the cap brim is plain.
- Rename `voltText` / `brandMarqueeTones.volt` when API churn is acceptable.
