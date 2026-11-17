# Release mechanics: Changesets, publishable packages, release workflow, docs

Agent: Claude Code (implementation sub-agent) · Branch/PR: t3/release-mechanics-changesets / none yet · Task: community release preparation, phase 2

## Goal

Make `@emdash-commerce/plugin-stripe`, `plugin-image-hotspots` and `design-system` publishable the way EmDash and
Cloudflare publish theirs: Changesets, a release workflow with provenance, tarballs that contain exactly what consumers
need, proof that the tarballs install and resolve, a decision on the EmDash plugin manifest, and docs.

## Steps

1. Read `emdash-cms/emdash` (`.changeset`, `release.yml`, `plugins/forms`, `plugins/webhook-notifier`, `plugin-cli` schema
   and README, plugin docs) and `changesets/action` (v2.1.2, Changesets v3) with `gh api`.
2. `pnpm add -Dw @changesets/cli @changesets/changelog-github`; wrote `.changeset/config.json`, `.changeset/README.md`, the
   first changeset and the `changeset` / `version` / `release` scripts.
3. Package metadata for the three packages (not private, description, keywords, homepage, bugs, repository with
   `directory`, author, `publishConfig`, `engines`, `files`, `main`, `peerDependencies`), LICENSE copies, README install
   sections. `PLUGIN_VERSION` of both plugins now reads `package.json` (tests pin it).
4. `pnpm pack` each package; listed contents; `publint --pack pnpm --strict`; a closure script over the extracted tarballs;
   installed the tarballs with npm into a scratch project and resolved/imported every export; built an Astro page and an
   EmDash site from them (details: ADR, "What was checked").
5. `.github/workflows/release.yml` (SHAs from `gh api repos/<o>/<r>/git/ref/tags/<tag>`, dereferenced; `actionlint` clean).
6. `emdash-plugin.jsonc` feasibility: not applicable (ADR). `docs/releasing.md`, the ADR and a memory file.

## Verification

- `pnpm check:ai`, `pnpm typecheck`, `pnpm test`, `pnpm build`: see the final report of the run; all run after the last edit.
- `publint --pack pnpm --strict`: "All good!" x3. Closure script: 0 unresolved imports, 0 missing export targets x3.
- Consumer smoke test (npm, outside the repo): every TypeScript export bundles and imports; `astro build` of a design-system
  page and of an EmDash site with both plugins succeed without `noExternal`.
- `actionlint .github/workflows/release.yml`: clean.
- Not run: any publish, any login to npm, the release workflow itself (it only runs on GitHub).

## Outcome

done, with the open points below.

## Follow-ups

- A maintainer must create the npm organization `@emdash-commerce` (names free?) and add the `NPM_TOKEN` secret; enable
  "Allow GitHub Actions to create and approve pull requests". Nothing here proves the scope exists.
- Decide whether the first versions (0.3.0 / 0.2.0 / 0.1.0) are what you want; edit `.changeset/first-public-release.md`.
- The Version Packages PR will not run `ci.yml` with the default token (see `docs/releasing.md`).
- `ci.yml` and the repo-root `CHANGELOG.md` / `README.md` were left to their owners.
