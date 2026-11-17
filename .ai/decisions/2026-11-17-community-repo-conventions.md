# Align community repo hygiene with EmDash and Cloudflare OSS conventions

Date: 2026-11-17 · Task: community release Phase 1 (repo hygiene and CI)

## Context

`emdash-commerce` is an MIT community project (`zawoj/emdash-commerce`), not an official EmDash or Cloudflare product. Before wider contribution, the repository needs the same baseline trust signals as mature OSS: private security reporting, contributing and conduct docs, issue/PR templates, dependency and Actions updates, lint in CI, and static analysis — without copying policies we do not use (no CLA, Lingui, or Changesets in this stream).

Parallel agent work and existing formatting differ by package (tabs in storefront/plugins, two-space indent in the design system). A mass formatter would conflict with in-flight PRs.

## Decision

1. **Governance files** at the repo root: `SECURITY.md` (GitHub private advisories only, commerce-specific scope), `CONTRIBUTING.md` (paths, gates, Conventional Commits, changelog rules, invariants from `AGENTS.md`, embedded AI policy), `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1; enforcement via GitHub Security advisories or private message to `@zawoj`, no email).
2. **GitHub metadata** under `.github/`: PR template, bug and feature issue forms, `config.yml` with Discussions and security advisory links, `CODEOWNERS`, Dependabot for npm (grouped minor/patch) and GitHub Actions.
3. **Lint:** add **oxlint** at the root with `.oxlintrc.json` modeled on EmDash, tuned so the current tree passes with **zero errors** and no repo-wide reformat; root script `pnpm lint`; CI runs lint and `pnpm check:ai`.
4. **EditorConfig** with per-glob indentation matching today’s code (tabs vs design-system spaces).
5. **CI workflows:** pin third-party Actions to full commit SHAs; add `codeql.yml` (JavaScript/TypeScript) and `zizmor.yml` (Actions workflows); keep the existing validate job behaviour and add lint.
6. **AI policy** lives in `CONTRIBUTING.md` and the PR template (disclosure, human review, no agent replies on issues) rather than a separate `AI_POLICY.md` file for now — same substance, fewer top-level entry points for a smaller repo.

## Alternatives

- **eslint + prettier/oxfmt** — rejected for this phase: would reformat the whole tree and collide with parallel work; EmDash uses oxfmt because it owns the style transition — we do not.
- **Copy EmDash `AI_POLICY.md` verbatim** — rejected: eligibility rules reference EmDash Maintainers and RFCs we do not have; a shorter policy embedded in `CONTRIBUTING.md` fits a single-maintainer community repo.
- **Single combined `security-analysis.yml`** (as EmDash) — rejected in favour of separate `codeql.yml` and `zizmor.yml` for clarity and independent scheduling in this PR stream.
- **e18e oxlint plugin** — not added yet; would add dependency and fix churn; correctness-oriented oxlint rules and categories suffice for phase 1.

## Consequences

- Contributors have a single checklist (`CONTRIBUTING.md` + PR template) and CI enforces `check:ai`, lint, typecheck, test, build.
- Lint warnings are expected until follow-up PRs tighten rules or fix call sites; errors block CI.
- Dependabot will open grouped update PRs; majors still deserve manual review (Stripe, Astro, EmDash peers).
- Security reports must use GitHub advisories — no mailing list to operate.
- Future phases can add `AI_POLICY.md`, stricter lint plugins, or formatter adoption once branches settle.