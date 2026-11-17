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
| **npm organisation and first release** | Create `@emdash-commerce` on npm, wire `NPM_TOKEN`, merge the pending Changesets "Version Packages" PR — see [docs/releasing.md](docs/releasing.md). Owner-only steps; the packages pass `pnpm publish --dry-run`. Afterwards switch the Cloudflare template workflow to `pnpm template:cloudflare --npm`. |
| **Prove the deploy paths on a real Cloudflare account** | Run the `cloudflare-template` workflow on `main`, press the Deploy button, then seed the site with `EMDASH_TOKEN` and send an order email through a real SMTP relay from the deployed Worker. Today all three paths are verified only locally (workerd, built Node server, a local SMTP sink) — see [docs/cloudflare.md](docs/cloudflare.md), [docs/production.md](docs/production.md), [docs/email.md](docs/email.md). |
| **HTTP email provider** | EmDash's built-in provider is SMTP only; a small provider plugin over an HTTP API (through the `email:deliver` hook) would serve relays without SMTP. See [docs/email.md](docs/email.md). |
| **E2E against the built Worker** | The Cloudflare e2e run uses `astro dev` on workerd with local D1/R2 (it needs the dev login to seed); the built Worker under `wrangler dev` is covered only by a manual check ([docs/testing.md](docs/testing.md)). |

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