# Scope and positioning of the community release

Date: 2026-11-17 · Task: prepare the project for a release announcement to the EmDash community

## Context

The repository is a demo-plus-libraries project: an EmDash Stripe commerce plugin, an image-hotspots field widget, a design
system and a mock "Cloudflare Merch" storefront. The owner wants to announce it to the EmDash community as an "official
commerce" and align its structure with Cloudflare's official open-source repositories (`emdash-cms/emdash`,
`cloudflare/templates`, `cloudflare/workers-sdk`). Those repositories were read for this decision: root governance files, issue
and PR templates, Changesets, `-cloudflare` template variants with D1 and R2, and a `cloudflare` metadata block in
`package.json` that the Deploy to Cloudflare button reads.

Nothing here is endorsed by Cloudflare or the EmDash maintainers. EmDash's contribution rules (a feature needs an accepted
proposal first, agents may not open pull requests or comment on issues, a CLA applies) govern contributions to their repository,
not to this one.

## Decision

- **Positioning.** A **community** project for EmDash, in its own repository (`zawoj/emdash-commerce`, MIT). The word
  "official" is not used. Becoming a first-party EmDash plugin is a separate path (an Ideas Discussion, then a proposal in
  `emdash-cms/emdash`, a CLA, a human-authored PR) and is not part of this work.
- **Demo theme.** The mock Cloudflare-merch theme stays (see `2026-11-15-cloudflare-merch-theme.md`) with its disclaimer made
  prominent. It is data and can be swapped, but a rebrand was not requested. This is the main remaining risk to the
  "unofficial" claim (it uses the name and palette of a real company) and is the owner's call.
- **Structure.** Match the conventions that apply to a community repository: governance files, templates, CI with pinned
  actions, Changesets for the publishable packages, a Cloudflare target, Playwright end-to-end tests, agent skills in EmDash's
  format. Details are in `2026-11-17-community-repo-conventions.md`, `2026-11-17-changesets-and-publishing.md` and
  `2026-11-17-cloudflare-target-switch.md`.
- **One pull request.** The streams ran as parallel agent work in separate worktrees and were merged into one branch, so the
  change is reviewed as a whole.

## Alternatives considered

- A neutral demo brand now. Cleaner for an announcement, but it changes copy, art and screenshots across the app without being
  asked; deferred to the owner.
- Proposing the plugin upstream to `emdash-cms/emdash` first. Slower, needs maintainers' acceptance, and would stop this
  repository from shipping.
- Splitting the work into several pull requests. Smaller reviews, but the streams share files (lockfile, package.json, docs) and
  the e2e suite depends on the rebuilt pages.

## Consequences

- The owner must create the npm organisation `@emdash-commerce` and add the `NPM_TOKEN` secret before the first release, and
  decide on the demo brand before the announcement.
- The Deploy to Cloudflare button cannot build this monorepo (see `.ai/memory/cloudflare-deploy-button-needs-an-isolated-subdirectory.md`);
  the documented path is Workers Builds or a standalone copy.
