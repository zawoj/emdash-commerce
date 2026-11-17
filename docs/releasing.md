# Releasing the packages

Three packages are published to npm under the `@emdash-commerce` scope. Releases are driven by
[Changesets](https://github.com/changesets/changesets), the same tool EmDash and Cloudflare's own repositories use.
The decision and its alternatives are in `.ai/decisions/2026-11-17-changesets-and-publishing.md`.

| Package | Ships | Peer dependencies |
| --- | --- | --- |
| `@emdash-commerce/plugin-stripe` | The `stripe-commerce` plugin (TypeScript source, `.astro` block, docs) | `emdash`, `astro` |
| `@emdash-commerce/plugin-image-hotspots` | The `image-hotspots:hotspots` field widget (TypeScript and React source) | `emdash`, `@emdash-cms/admin`, `react`, `react-dom` |
| `@emdash-commerce/design-system` | Tokens, Astro components, client scripts, the `token-lint` / `wireframe-lint` binaries | `astro` |

`@emdash-commerce/storefront` (`apps/storefront`) is the private demo; it is under `ignore` in `.changeset/config.json` and
is never released. These are community packages for EmDash, not official EmDash packages.

## Two changelogs

- **`CHANGELOG.md` at the repo root** is the hand-written history of the monorepo and the demo: every PR adds an entry,
  whether or not a package changes (see `.ai/README.md`).
- **`packages/<name>/CHANGELOG.md`** is what a package user reads. Changesets writes it from the changeset files when a
  release is versioned. `plugin-stripe` and `design-system` already have hand-written history in that file. Changesets
  inserts a new `## <version>` section above the first existing `## <number>.<number>` heading, so in `design-system` it
  lands at the top (above the dated entries), and in `plugin-stripe` it lands **below** the hand-written
  `## Unreleased — catalog v2` block and above `## 0.2.0`. On the first release, edit the "Version Packages" pull
  request to move that block under the new `## 0.3.0` heading (or rename it) so the file reads newest first. Changesets also
  runs Prettier over a changelog it touches, which adds a blank line after each `###` heading once.

## Adding a changeset (every PR that changes a published package)

```bash
pnpm changeset
```

Pick the packages and the bump, then edit the generated `.changeset/<name>.md` in plain, user-facing language. What needs
a changeset, the bump types for `0.x`, and good and bad examples: `.changeset/README.md`. A PR that only touches the demo,
docs, tests or CI needs none. `pnpm changeset status` lists what is pending.

## How a release happens

`.github/workflows/release.yml` runs on every push to `main` (and only in `zawoj/emdash-commerce`):

1. It checks out, installs with the frozen lockfile and runs the gate (`pnpm check:ai`, `typecheck`, `test`, `build`).
2. [`changesets/action`](https://github.com/changesets/action) looks at `.changeset/`:
   - **Pending changesets:** it runs `pnpm run version` (`changeset version`) on a `changeset-release/main` branch and
     opens or updates the **"chore: version packages"** pull request. That pull request bumps `version` in each package,
     writes the package `CHANGELOG.md` entries and deletes the consumed changeset files. Review it like any PR.
   - **No pending changesets** (the "Version Packages" PR was just merged): it runs `pnpm run release`
     (`changeset publish`), which publishes every package whose version is not on npm yet, with
     [provenance](https://docs.npmjs.com/generating-provenance-statements) (`publishConfig.provenance` plus
     `NPM_CONFIG_PROVENANCE` and the job's `id-token: write`), then pushes git tags and creates one GitHub Release per
     package.

The plugin versions (`PLUGIN_VERSION` in each plugin) are read from the package's own `package.json`, so a bump cannot
leave EmDash reporting a stale version; a test in each plugin pins that.

## One-time setup (not done by this repository)

- **The npm scope.** The npm organization `@emdash-commerce` must exist and a maintainer must own it, and the three
  package names must be free. This repository does not create it and nothing here proves it exists. Until it does, the
  publish step fails (and nothing is released).
- **`NPM_TOKEN`**, a repository secret (Settings, Secrets and variables, Actions): an npm access token that may publish
  to `@emdash-commerce` (a granular token limited to that scope, with "Bypass two-factor authentication" or an
  automation token). Create it on npmjs.com; never commit it or paste it into a PR. Once packages exist on npm, npm's
  [trusted publishing](https://docs.npmjs.com/trusted-publishers) can replace the token (the workflow already has
  `id-token: write`).
- **Actions may open pull requests.** Settings, Actions, General, "Allow GitHub Actions to create and approve pull
  requests" must be on, or the "Version Packages" pull request cannot be created. It is on since 2026-11-17 (the default
  `GITHUB_TOKEN` permission stays read-only); the first "Version Packages" pull request is #10. A pull request opened with the default
  `GITHUB_TOKEN` does not trigger other workflows, so `ci.yml` does not run on it; either run the checks by pushing an
  empty commit to its branch, or give the action a GitHub App or personal-access token through `github-token` (EmDash
  uses a GitHub App).
- **The first release.** `.changeset/first-public-release.md` is pending, so the first merge to `main` after this lands
  opens a "Version Packages" pull request (`plugin-stripe` 0.2.0 to 0.3.0, `plugin-image-hotspots` 0.1.0 to 0.2.0,
  `design-system` 0.0.1 to 0.1.0). Do not merge it before the scope and the secret exist.

## Dry run (never `publish`)

```bash
pnpm changeset status                                                                 # what the next release would bump
pnpm --filter @emdash-commerce/plugin-stripe pack --pack-destination /tmp/packs       # one tarball per package
(cd packages/plugin-stripe && npm pack --dry-run --json)                              # the file list, nothing written
(cd packages/plugin-stripe && npx publint --pack pnpm --strict)                       # lints exports, files and types
```

To preview a release locally, run `pnpm changeset version` on a throwaway branch (it rewrites versions and changelogs and
removes the changesets) and discard it with `git restore .` plus `git clean -fd .changeset`.

Open the tarball (`tar -tzf`) and check that it contains `src`, `README.md`, `LICENSE`, `CHANGELOG.md` (and `docs` for
`plugin-stripe`, `scripts/*-lint.mjs` for `design-system`) and no `*.test.*`, test fixtures or `real-host` files. The
`files` list in each `package.json` enforces that; `./testing` of `plugin-stripe` does not import any excluded file.

## Installing the packages (consumers)

The packages ship TypeScript, React and Astro source, like EmDash's own `@emdash-cms/plugin-forms`: there is no build step
on install and the site's Vite build compiles them.

```bash
pnpm add @emdash-commerce/plugin-stripe @emdash-commerce/plugin-image-hotspots @emdash-commerce/design-system
```

Register the two plugins in `astro.config.mjs` (the design system is imported from your pages and layouts, not
registered):

```js
import emdash, { local } from "emdash/astro";
import { sqlite } from "emdash/db";

export default defineConfig({
  integrations: [
    emdash({
      database: sqlite({ url: "file:./data.db" }),
      storage: local({ directory: "./uploads", baseUrl: "/_emdash/api/media/file" }),
      plugins: [
        {
          id: "image-hotspots",
          entrypoint: "@emdash-commerce/plugin-image-hotspots",
          adminEntry: "@emdash-commerce/plugin-image-hotspots/admin",
          fieldWidgets: [{ name: "hotspots", label: "Image with points", fieldTypes: ["json"] }],
        },
        {
          id: "stripe-commerce",
          entrypoint: "@emdash-commerce/plugin-stripe",
          componentsEntry: "@emdash-commerce/plugin-stripe/astro",
          options: { defaultCurrency: "usd", supportedCurrencies: ["usd"] },
        },
      ],
    }),
  ],
});
```

`vite.ssr.noExternal`: `apps/storefront/astro.config.mjs` lists the design system and the hotspots plugin because they are
workspace links there. A copy installed from npm built without it when the tarballs were installed into an EmDash 1.5 site on Astro 7
("What was checked" in the ADR).
If a build ever reports an unknown `.ts`, `.tsx` or `.astro` extension for one of these packages, add it:

```js
vite: { ssr: { noExternal: ["@emdash-commerce/design-system", "@emdash-commerce/plugin-image-hotspots", "@emdash-commerce/plugin-stripe"] } },
```

The hotspots widget imports `@emdash-cms/admin`; if your package manager installs a second copy next to the one `emdash`
renders the admin with, alias it to that copy (the comment in `apps/storefront/astro.config.mjs` shows how). Each
package's README has the rest of its setup; the Stripe plugin also needs the Stripe keys and the webhook secret
(`docs/getting-started.md`).

## Not on the EmDash plugin registry

EmDash's registry (`emdash plugin` CLI, `emdash-plugin.jsonc`) is for **sandboxed** plugins. Both plugins here are
native, so they ship on npm only. Why, and what would change that: the ADR.

## The Cloudflare template and the first release

The generated Cloudflare template (`pnpm template:cloudflare`, `docs/cloudflare.md`) vendors the three packages from
`pnpm pack`, so it needs no npm release and does not depend on this flow. Once the packages are published, switch the
workflow's generate step to `pnpm template:cloudflare --npm`: the copy then depends on `^<version>` of each package from the
registry and `vendor/` disappears. Until then keep vendor mode: `--npm` would fail to install (the versions are not on npm).
A package release does not republish the template by itself; the next push to `main` that touches a path the template is
made of does.
