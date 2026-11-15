# The demo shop is mock Cloudflare merch, themed by data and a token swap

Date: 2026-11-15 · Supersedes: the palette parts of `2026-11-15-wireframe-skin.md` (blue ink ramp, tinted photos, no hue
besides ink). Its rules against decoration stand.

## Context

The demo storefront sold sportswear (running, cycling, triathlon), in PLN, with Unsplash photos downloaded at seed time and
a blue wireframe skin. We wanted a more recognisable demo for the EmDash community, with more kinds of product than apparel
(bundles, drinkware, desk gear, a membership), no network at seed time, and a clear on-ramp for people and AI agents who
clone the repo. The merch is **fictional**: the repo has no real catalog and must not look like an official store.

## Decision

- **Theme as data.** The catalog is `scripts/lib/merch-catalog.mjs` (brands, categories, products, bundles, membership, home
  CTA, look and callouts), consumed by `scripts/seed-demo.mjs`. The home page structure is `features/home/config.ts` and
  `copy.ts`: rail keys are product category slugs (`bundles`, `apparel`, `desk`, `drinkware`). Re-theming means editing those
  files, the art and the tokens; `docs/ai-guide.md` has the checklist.
- **Art is generated and committed.** `scripts/art/` draws flat vector illustrations with no text and rasterises them with
  `sharp` to PNG in `apps/storefront/public/merch/`. PNG because EmDash's default upload allowlist excludes SVG. The seed
  uploads those files to the media library; the hero, spotlight and category tiles are served as static `/merch/*.png`.
  `pnpm art` regenerates; tests check that every file the catalog and the home config name exists.
- **Cloudflare palette.** `--ink-*` becomes a warm neutral ramp whose 800 is the charcoal `#404041`; a new `--orange-*` ramp
  (500 `#F6821F`, 300 amber `#FBAD41`) carries the accent. Primary controls are orange with **ink** text (white on orange is
  2.58:1); orange as text uses the darker `--orange-700`. Photos are shown as shot (`--image-filter: none`). `wireframe-lint`
  now allows greys and hues 15-45 degrees, and `token-contrast.test.mjs` asserts WCAG ratios of the token pairs.
- **USD.** `DEFAULT_CURRENCY` is `USD` and the storefront registers the plugin with `defaultCurrency: "usd"`,
  `supportedCurrencies: ["usd"]` (the plugin's own default stays `pln`).
- **Setup scripts.** `pnpm bootstrap` (writes `.env`: generates the encryption key, takes a sandbox key, reads the webhook
  secret from the Stripe CLI, refuses a live key, never prints a secret) and `pnpm doctor` (read-only). Named so because
  `pnpm init` and `pnpm setup` are pnpm built-ins and would never reach a package script.
- **Disclaimer.** README, FAQ, About page and the site tagline say it is an unofficial demo, not affiliated with Cloudflare.
  The art uses generic shapes (a cloud, a shield, brackets), not Cloudflare's logo files.

## Alternatives

- Keep Unsplash photos: no suitable merch photos exist, the seed needs the network, and licences vary.
- Commit SVG art: the media library rejects SVG, and allowing it needs an upload-time sanitiser we do not have.
- Draw art at seed time with `sharp`: puts a native dependency into a "dependency-free" script and slows the seed.
- Keep PLN: a US-brand merch demo in zloty reads wrong, and the Polish copy stays as a locale, not as the market.
- Make orange the page text colour: 2.7:1 on white; a dark orange token for text and ink on orange fills avoids it.

## Consequences

- A database created before this change has a PLN-only `currency` select on prices: reset it (`docs/getting-started.md` §8).
- Prop and tone names keep their old wording (`voltText`, `brandMarqueeTones.volt`); renaming is API churn for later.
- Blog pages keep the template's neutral greys and were not audited against the new palette.
- Product art is illustrative, not photographic; a real shop replaces `public/merch/` and the catalog file.
