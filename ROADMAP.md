# Roadmap

> **Exception to the repo documentation rule.** Everything under `docs/`, `.ai/memory/`, and the README records
> **actual state**, not plans. **`ROADMAP.md` is the only labelled place for forward-looking intent.** Items here may
> never ship; absence from this file does not mean something is out of scope forever.

Community commerce for [EmDash](https://github.com/emdash-cms/emdash): an unofficial mock Cloudflare-merch demo, MIT,
not an official EmDash or Cloudflare product.

## Next

Work the maintainers intend to tackle when capacity allows, in rough priority. **No dates** — order is not a promise.

| Area | Intent |
| --- | --- |
| **One-click Deploy to Cloudflare** | A standalone deployable copy of `apps/storefront` (vendored workspace packages or published npm deps) so Cloudflare's Deploy button and template flows can build without `workspace:*` siblings. Today only Workers Builds with monorepo root directory works — see [docs/cloudflare.md](docs/cloudflare.md). |
| **Production seeding** | A path to populate a deployed site without `pnpm seed` (dev login only). Options: document `emdash site export` / `import`, an admin-first catalog workflow, and always queue **catalog resync** after import because Stripe ids live in plugin storage, not in export files. |
| **npm organisation and first release** | Create `@emdash-commerce` on npm, wire `NPM_TOKEN`, merge the pending Changesets "Version Packages" PR — see [docs/releasing.md](docs/releasing.md). |
| **Email on deployed sites** | Document and optionally automate EmDash email provider setup (SMTP or provider plugin) so order confirmation and guest order-link emails deliver outside dev. |
| **Production `seed.json` hygiene** | Remove or gate the `feedback` collection (Notes dev tool) from `apps/storefront/seed/seed.json` for real production deploys — called out in [docs/cloudflare.md](docs/cloudflare.md) and [docs/production.md](docs/production.md). |
| **Playwright e2e** | Browser tests for the shop happy path and the Cloudflare target. The storefront and design system already expose stable `data-testid` hooks on cart, checkout success and order lookup; a committed Playwright suite does not exist yet. |

## Explicitly not planned (for this repo)

These are **out of scope for the community demo** unless a contributor opens a Discussion and someone adopts it.
The plugin may still support some of them as options your own site can turn on.

| Topic | Why not here |
| --- | --- |
| **Customer accounts** | Guest checkout and emailed signed links only; no login, addresses on file or order history in the storefront. |
| **Digital downloads** | Not built in the plugin or demo catalog. |
| **Multi-currency cart** | Plugin allows several catalog currencies; a cart mixing them returns `MIXED_CURRENCY` — no FX or geo pricing in the demo. |
| **Promotion codes, shipping rates, Stripe Tax, embedded Checkout** | Plugin options the demo leaves off (`packages/plugin-stripe/README.md`, "Options"). |
| **Official EmDash / Cloudflare endorsement** | Community project only; trademarks stay with their owners. |

## If you want to help

Open a [Discussion](https://github.com/zawoj/emdash-commerce/discussions) or an issue, or pick an item above and
propose a focused PR. See [CONTRIBUTING.md](CONTRIBUTING.md).