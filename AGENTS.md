# AGENTS.md — emdash-commerce

Entry point for AI coding agents — a **map**. Claude Code reads it through `CLAUDE.md` (a one-line `@AGENTS.md`
import); every other agent reads it directly. The nearest `AGENTS.md` to the file you edit wins; an explicit instruction
from the user wins over all of them.

## The `.ai/` folder and the changelog — mandatory for every agent

Applies to Claude Code, Codex, Cursor and humans alike. The repo keeps the technical record: how it is built, what changed
and why. Docs and memory record the **actual state**, never plans. Layout, naming and formats: **`.ai/README.md`**;
`pnpm check:ai` (also run in CI) rejects a wrong name, a stray folder or an unindexed memory.

| Where | What goes there | Rule |
|---|---|---|
| `CHANGELOG.md` | The history of changes | **Every PR adds an entry** at the top under today's date: what changed and *why*, anything to do outside the code. |
| `.ai/decisions/` | Technical decisions (ADRs) | A structural or technical decision worth keeping gets `YYYY-MM-DD-slug.md` (context, decision, alternatives, consequences). No status and no subfolders — a changed decision is a new file that supersedes the old one. |
| `.ai/runs/` | Logs of autonomous AI runs | Every autonomous run leaves one log, `YYYY-MM-DD-slug.md` (goal, steps, verification, outcome, follow-ups), finished before the run stops. |
| `.ai/memory/` | What the code and docs cannot say | At session start read `.ai/memory/MEMORY.md` and the entries that match the task. **After fixing a bug**, or whenever you learn something non-obvious, add its own memory file (one topic per file). Update instead of duplicating, **never secret values**, every file linked exactly once in `MEMORY.md`. |
| `docs/` | How the project works | Updated in the PR that changes the behaviour it describes. |

Dates are the real day the file is created; slugs are lowercase kebab-case ASCII. Code comments stay technical (what the
code does and the technical why) — decisions, history and task ids go to the changelog, `.ai/decisions/` or `.ai/memory/`.

## Project overview

Commerce for EmDash (Astro-based CMS): a Stripe plugin, an image-hotspots field widget, a design system and a demo
storefront. The demo shop is an unofficial **mock Cloudflare-merch store** (fictional products, USD, generated art): the
theme is data, see `docs/ai-guide.md`. An **Nx + pnpm monorepo**, each project an Nx project named after its folder. Runtime needs **Node >= 24.22.1**.

| Folder | Nx project · package | Role | Port |
| --- | --- | --- | --- |
| `apps/storefront/` | `storefront` · `@emdash-commerce/storefront` | Astro 7 SSR shop on EmDash (Node + SQLite + local uploads). Own `AGENTS.md` and skills. Admin at `/_emdash/admin`. | `4360` |
| `packages/plugin-stripe/` | `plugin-stripe` · `@emdash-commerce/plugin-stripe` | EmDash plugin `stripe-commerce`: catalog, carts, Checkout, orders, webhooks. Docs in `packages/plugin-stripe/docs/`. | — |
| `packages/plugin-image-hotspots/` | `plugin-image-hotspots` · `@emdash-commerce/plugin-image-hotspots` | EmDash plugin `image-hotspots`: the `image-hotspots:hotspots` field widget. | — |
| `packages/design-system/` | `design-system` · `@emdash-commerce/design-system` | Tokens and every visual component of the storefront. | — |

Plugin ids `stripe-commerce` and `image-hotspots` and the widget ref `image-hotspots:hotspots` are stored in content and
schema: never rename them.

## Setup & commands (project root)

See `README.md` for the short quickstart and `docs/getting-started.md` for the full walkthrough (`.env`, Stripe sandbox keys, `stripe listen`, seed, reset, troubleshooting). Run everything through the root
scripts or `pnpm nx …`; never guess Nx flags — check `pnpm nx <target> --help`.

| Command | Does |
| --- | --- |
| `pnpm install` | Dependencies |
| `pnpm dev` | Storefront dev server on `4360` (`npx astro dev stop` in `apps/storefront` stops it) |
| `pnpm bootstrap` · `pnpm doctor` | First-run `.env` setup (idempotent, never prints a secret, refuses a live Stripe key) · read-only health check |
| `pnpm seed` | Mock catalog (`scripts/lib/merch-catalog.mjs`) and Homepage fields (`scripts/seed-demo.mjs`; dev server must run) |
| `pnpm art` | Regenerates the mock product art (`scripts/art/` → `apps/storefront/public/merch/`, PNG, committed) |
| `pnpm check:ai` | `.ai/` layout, `YYYY-MM-DD-slug.md` names, memory index |
| `pnpm typecheck` · `pnpm test` · `pnpm build` | Validation gate (`nx run-many`) — run all three before calling work done |

## Where to read first

| Area | Where |
| --- | --- |
| AI onboarding: architecture map, what you can build, ready prompts, how to re-theme the catalog | `docs/ai-guide.md` |
| Running the shop from zero (prerequisites, Stripe sandbox, env, webhook secret, seed, first purchase, reset, troubleshooting) | `docs/getting-started.md` |
| The storefront: routes, features, rules | `apps/storefront/AGENTS.md` |
| The Stripe plugin: layers, HTTP API, how to extend | `packages/plugin-stripe/docs/` (`architecture.md` · `api.md` · `extending.md`) · `.ai/memory/emdash-plugin-stripe-extending.md` · `.ai/decisions/2026-11-12-emdash-stripe-commerce-architecture.md` |
| The image-hotspots plugin and React field widgets | `packages/plugin-image-hotspots/README.md` · `.ai/memory/emdash-react-field-widgets.md` |
| The design system | `packages/design-system/README.md` (conventions, tokens, `token-lint`) · its `CHANGELOG.md` |
| How a local site reaches production; agent schema changes over MCP | `docs/production.md` · `.ai/decisions/2026-11-12-emdash-agent-schema-changes-over-mcp.md` |
| EmDash keeps its schema in the database | `.ai/memory/emdash-schema-lives-in-the-database.md` |

**Invariants:**

- **Nothing CMS-driven is prerendered.** Every content route is SSR; no `getStaticPaths` for EmDash content.
- **All UI lives in `packages/design-system/`**; the storefront only shapes data into component props. A missing component
  is added to the design system, never written as markup in the app. A UI change also updates
  `packages/design-system/CHANGELOG.md` and keeps `pnpm nx test design-system` (`token-lint`) green.
- **The storefront imports the plugin only through its `exports`** (`@emdash-commerce/plugin-stripe`, `/contracts`,
  `/astro`, `/testing`), never by a relative path into `packages/plugin-stripe/src`.
- **A schema change is mirrored in `apps/storefront/seed/seed.json`** and the types are regenerated (see the memory above).
- **The amounts of a cart are derived on the server**; the client sends price ids and quantities only.

## Code style — binding core

- Files stay under **600 lines** — split into a folder (`index` + named parts) before that.
- Arrow functions by default; `function` only where a runtime requires it.
- Strict TypeScript: no `any`, `interface` for object shapes, vocabularies as `as const` objects + derived unions in
  `constants.ts` (never raw string literals scattered in app code).
- Guard clauses / early returns first; name compound conditions as helpers.
- Booleans are `is/has/can` and **always positive** (`isUsed`, never `isUnused`) — negate at the call site.
- Imports: framework → third-party → `@/` → relative. Code, comments and docs in English.

## Testing

- Unit tests run on **Vitest**: `pnpm test` runs every project; `pnpm nx test <project>` runs one. The design system's
  `test` is `token-lint` — no raw colours or sizes outside the tokens.
- New or changed behaviour ships with a test. Assert what the consumer receives, not the implementation; cover the seam
  between two individually-correct helpers.
- Before calling work done run `pnpm typecheck`, `pnpm test` and `pnpm build`. Green gates are not proof the feature
  works — for anything user-visible, run it (dev server, curl, browser).

## Security

- **No secrets in the repo.** `.env*` is git-ignored except `.env.example`, which is the contract: add every new variable
  there with a safe placeholder. Never print, log or paste a real secret.
- **Stripe sandbox keys only** in local work; a live key is never used outside a deployed production environment. Webhook
  signatures are verified on the raw body with a constant-time compare; the plugin never trusts amounts from the browser.
- **Validate at the boundary.** Parse and bound request input (cart, checkout, webhooks, query params) before it reaches a
  query or a hook.
- **Dependencies:** add them with pnpm and keep the lockfile committed; do not leave unused or known-vulnerable packages
  behind (`pnpm audit`).
- **Production is read-only unless told otherwise.** Never run seeds or destructive commands against a production database
  or host without an explicit instruction.

## Commits & pull requests

- **Conventional Commits**, English, imperative: `type(scope): subject` (`feat`, `fix`, `refactor`, `docs`, `test`,
  `chore`; scope = `storefront`, `plugin-stripe`, `plugin-image-hotspots` or `design-system`).
- Keep a PR to one concern. Do not commit or push unless asked.
- Every PR adds a `CHANGELOG.md` entry; a UI change also updates `packages/design-system/CHANGELOG.md`; a technical
  decision goes to `.ai/decisions/`, a trap or lesson to `.ai/memory/`.
- Run the validation gate (see Testing) before opening a PR; CI repeats it.
- The PR description states what changed and why, how it was verified, and what is **not** covered or fixed.
