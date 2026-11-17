# Contributing to emdash-commerce

Community commerce for [EmDash](https://github.com/emdash-cms/emdash): a mock storefront, the `stripe-commerce` plugin, an image-hotspots widget, and a shared design system in one Nx + pnpm monorepo. This guide covers setup, checks, and pull request rules. For architecture and invariants agents rely on, see [AGENTS.md](AGENTS.md).

## How to contribute

| Kind of change | Before you code |
| --- | --- |
| Bug fix | Open a [bug report](https://github.com/zawoj/emdash-commerce/issues/new?template=bug_report.yml) or link an existing one. |
| Documentation | Issue or [Discussion](https://github.com/zawoj/emdash-commerce/discussions) when the doc change reflects a product decision. |
| Tests | Same as the behaviour you are covering; link the bug or feature. |
| Refactor | Open an issue or Discussion — refactors need a clear, reviewable scope. |
| Feature | Start in [Discussions](https://github.com/zawoj/emdash-commerce/discussions); agree on shape before a large PR. |

Small drive-by refactors and multi-topic “cleanup” PRs are not accepted.

## Prerequisites

| Tool | Version |
| --- | --- |
| Node.js | **>= 24.22.1** (see `.node-version`) |
| pnpm | **10** (`packageManager` in `package.json`, currently `pnpm@10.33.0`) |
| Git | current |
| Stripe CLI | for local webhook forwarding — see [docs/getting-started.md](docs/getting-started.md) |

Enable pnpm via Corepack once: `corepack enable`.

## Setup

Do not duplicate the full walkthrough here — use:

- **Quickstart:** [README.md](README.md) (clone, install, bootstrap, dev).
- **End-to-end:** [docs/getting-started.md](docs/getting-started.md) (Stripe sandbox, `.env`, `stripe listen`, seed, first purchase, troubleshooting).

At the repo root after clone:

```bash
pnpm install
pnpm bootstrap   # optional but recommended on first run
pnpm dev         # storefront on http://localhost:4360
```

Admin UI: `http://localhost:4360/_emdash/admin`.

## Repository layout

| Path | What |
| --- | --- |
| `apps/storefront/` | Astro 7 SSR demo shop on EmDash (Node + SQLite). |
| `packages/plugin-stripe/` | `stripe-commerce` plugin — catalog, carts, Checkout, orders, webhooks. |
| `packages/plugin-image-hotspots/` | `image-hotspots:hotspots` React field widget. |
| `packages/design-system/` | Design tokens and storefront UI components. |
| `scripts/` | Seed, bootstrap, art generation, repo checks. |
| `.ai/` | ADRs, agent memory, run logs — see [.ai/README.md](.ai/README.md). |

## Checks

Run before pushing:

```bash
pnpm check:ai    # .ai/ layout and memory index
pnpm lint        # oxlint (zero errors required)
pnpm typecheck
pnpm test
pnpm build
```

CI runs the same gates on every pull request and on push to `main`.

## Pull requests

- Branch from **`main`**.
- Fill out [.github/PULL_REQUEST_TEMPLATE.md](.github/PULL_REQUEST_TEMPLATE.md).
- Use **Conventional Commits** on the branch: `type(scope): subject`
  - **Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`
  - **Scopes:** `storefront`, `plugin-stripe`, `plugin-image-hotspots`, `design-system` (omit scope only for repo-wide chore/docs when no package owns the change).
- Add a **[CHANGELOG.md](CHANGELOG.md)** entry at the top under today’s date on every PR.
- **UI changes** also update [packages/design-system/CHANGELOG.md](packages/design-system/CHANGELOG.md) and include **before/after screenshots** in the PR body as a two-column table (one row per affected screen).
- **Behaviour changes** ship with tests that assert what consumers receive, not implementation details.

## What we do not accept

- Drive-by formatting or style-only sweeps across unrelated files.
- Speculative refactors without an agreed issue or Discussion.
- PRs that mix unrelated concerns (split them).
- Live Stripe keys, committed secrets, or logged credentials.

## Rules (binding)

- **Stripe sandbox only** in local work; never use live keys outside production you operate.
- **Never commit or paste secrets** — follow `.env.example` as the env contract.
- **Files stay under 600 lines** — split into a folder before they grow larger.
- **All storefront UI** lives in `packages/design-system/`; the app only maps data to props.
- **Invariants** in [AGENTS.md](AGENTS.md) (SSR for CMS routes, server-derived cart amounts, plugin `exports` imports, schema mirrored in `seed/seed.json`, and others) are not negotiable in drive-by PRs.

## AI-assisted contributions

AI tools are welcome when a **human submitter** remains responsible:

- Review the **entire diff**, run the validation gates, and **exercise changed behaviour** yourself before opening a PR.
- **Disclose** material AI assistance in the PR template (model and tool).
- A **human authorises each PR** — no autonomous agents opening or merging on their own.
- **Do not use agents to reply to humans** on issues, Discussions, or pull request threads.

Generated code is held to the same bar as human-written code.

## Conduct and security

- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) applies to all project spaces.
- Report vulnerabilities privately via [SECURITY.md](SECURITY.md) (GitHub Security tab only).