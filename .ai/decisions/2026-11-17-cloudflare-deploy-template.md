# Deploy to Cloudflare from a generated orphan branch that vendors the packages

Date: 2026-11-17 · Task: roadmap "standalone deployable copy of apps/storefront"

## Context

Cloudflare's Deploy button treats the subdirectory of its URL as the root of a new repository and needs the app fully isolated
there (`.ai/memory/cloudflare-deploy-button-needs-an-isolated-subdirectory.md`). `apps/storefront` depends on three sibling
packages as `workspace:*`, which are not on npm yet, so the button cannot build `tree/main/apps/storefront`. The storefront's
`package.json` already carries the `cloudflare` block (label, bindings, secret descriptions) the button reads. The button also
pre-fills the `build` and `deploy` scripts, and here `build` is the Node build.

## Decision

1. **A generator, not a second app.** `pnpm template:cloudflare` (`scripts/template/`) writes a copy of `apps/storefront` to an
   output folder; the monorepo keeps one storefront (the reason `2026-11-17-cloudflare-target-switch.md` rejected a second
   app). The copy has its own `package.json` where `build` is the Cloudflare build and `deploy` is `wrangler deploy`.
2. **Vendor the packages, `--npm` as the later mode.** Each package is packed with `pnpm pack` (so its `files` allow-list
   decides, exactly as npm would ship it) and extracted to `vendor/<name>/`; the manifest depends on `file:./vendor/<name>`.
   `--npm` writes `^<version>` instead. Vendor is the default because the packages are not published; `--npm` becomes the
   default after the first release (`docs/releasing.md`).
3. **`file:` directories, not tarballs, not `link:`.** A `file:` directory dependency is installed like a registry package
   (copied into the store, its own `dependencies` installed, peers resolved), which is the shape the packages were checked in
   (`published-packages-ship-source.md`). `link:` would symlink, so the vendored packages' own dependencies (`stripe`, `zod`)
   would not be installed. Tarballs are opaque binary blobs in git with a noisy diff on every regeneration.
4. **A generated orphan branch `cloudflare-template`, not a committed directory.** The button URL
   (`.../tree/cloudflare-template`) points at the branch root. A committed `template/` directory in `main` would be a second
   copy to review and keep in step in every PR, would show 900 files of duplicate source in diffs and code search, and the
   button needs the directory to be the repo root anyway (the subdirectory form is exactly what it handles with the isolation
   rule). A force-pushed orphan branch has no history to maintain; its single commit message names the source commit.
5. **Workflow `cloudflare-template.yml`.** Triggers: `workflow_dispatch`, plus `push` to `main` limited to the paths the
   template is made of (`apps/storefront`, `packages`, `scripts/template`, the workflow), so the branch does not go stale after
   a storefront or package merge; and `pull_request` on the same paths, where only the build job runs (a PR proves the template
   still builds, publishes nothing). The build job generates the copy under `RUNNER_TEMP` (outside the checkout, so pnpm
   cannot see the workspace), `pnpm install --ignore-workspace` (which also writes the lockfile that the branch ships, so
   Cloudflare builds with a frozen, reproducible lockfile), typecheck, build, `wrangler deploy --dry-run`, then uploads the
   cleaned folder as an artifact.
6. **The push permission is confined.** Workflow `permissions: {}`; the build job has `contents: read`; only the publish job
   has `contents: write`, runs only off pull requests and only in `zawoj/emdash-commerce`, does **no checkout** and runs no
   repository code: it downloads the artifact, `git init`s an orphan branch and force-pushes with the token passed through a
   masked `http.extraheader` for that one command (no persisted credentials). The artifact is built by the read-only job, so
   the job that can write only handles data. Actions are pinned to commit SHAs, `zizmor` passes.
7. **The copy is checked for isolation.** The generator resolves every relative specifier of every code and config file against
   its folder and fails on one that leaves the root, and fails on any remaining `workspace:`/`catalog:` spec in the manifest or in
   a packed package.

## Alternatives considered

- **Publish the packages to npm first and point the button at a small template** — the long-term shape (`--npm` is its
  switch), but it blocks the button on a release. Vendoring needs no account or token.
- **A committed `templates/cloudflare/` directory** — see 4.
- **A GitHub "template repository" as a separate repo** — a second repo to own and to sync; the orphan branch is the same
  result without it.
- **Only `workflow_dispatch`** — the branch would silently lag behind `main`; a button that deploys an old shop is worse
  than a run on every relevant merge. The cost (a ~2-minute job on relevant pushes) is small.
- **Rewriting `astro.config.mjs` to drop the Node branch** — rejected: the copy's runtime config stays byte-identical to the
  repo's, so what the repo's tests and runs cover is what the template runs. `DEPLOY_TARGET=cloudflare` is baked into the
  copy's `build`/`dev`/`preview` scripts instead.

## Consequences

- The Deploy button URL works once the workflow has run once on `main` (it creates the branch). Until then it 404s.
- The branch is generated: edits there are overwritten; the README says so and links back.
- A package's `files` allow-list is now load-bearing for the template too: a source file missing from it breaks the template
  build, which the workflow's build job catches on a pull request.
- Dependencies of the copy float to the newest allowed by the ranges in `apps/storefront/package.json` at generation time;
  the lockfile is regenerated with every run (no frozen install of the copy in CI, by design: it is the thing being created).
- Not verified: the button itself and Cloudflare's clone and provisioning (needs an account); the workflow on GitHub.
