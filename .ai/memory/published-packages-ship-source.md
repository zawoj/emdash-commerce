---
name: published-packages-ship-source
description: The three @emdash-commerce packages publish TypeScript/Astro source with a hand-kept `files` list; plugin versions come from package.json; `pnpm version` is a pnpm builtin
---

# Published packages ship source; keep `files` in step with `exports`

`plugin-stripe`, `plugin-image-hotspots` and `design-system` are published as source (no build), like EmDash's
`@emdash-cms/plugin-forms`. Release flow and setup: `docs/releasing.md`; decision:
`.ai/decisions/2026-11-17-changesets-and-publishing.md`.

- `files` in each `package.json` is an allow-list with `!` exclusions for tests, fixtures, `*.contract.ts`,
  `test-support.ts` and the real-host harness. When you add an export or a file an export imports, make sure it is not
  excluded: pack, extract and resolve every relative import (the ADR lists how) or build a scratch site from the tarball.
  `publint --pack pnpm --strict` does not catch a missing source file.
- `PLUGIN_VERSION` of both plugins is `packageJson.version` (JSON import), not a literal, so `changeset version` cannot
  leave EmDash reporting a stale plugin version. Do not turn it back into a literal.
- The root script is `version` (`changeset version`), but `pnpm version` is a pnpm builtin: call it as `pnpm run version`
  (the release workflow does).
- A plain install from npm of all three packages builds in an EmDash site without `vite.ssr.noExternal` (checked with
  EmDash 1.5 / Astro 7.3.2 from the tarballs). Do not document `noExternal` as required.
- Outside the repo the global `pnpm` shim (corepack) can be a version that is not installed; use `npm` in scratch
  projects.
- Both plugins are native (React admin entry, `.astro` component, in-process `emdash/runtime`), so there is no
  `emdash-plugin.jsonc` and no EmDash-registry listing; the registry takes sandboxed plugins only.
