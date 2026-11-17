---
name: emdash-editor-bar-dev-tools
description: how apps/storefront extends the EmDash visual editing pill (X-ray, Inspect, Notes + copy prompt, Audit, Errors, hide/show) and the traps of that pill
metadata:
  type: project
---

# EmDash editing pill: dev-tools add-on

The dark pill ("EmDash | Edit mode | PUBLISHED") is a closed HTML string from EmDash's middleware, shown only to a
signed-in editor. It has no extension API, so `apps/storefront/src/dev-tools/editor-bar/` (imported from
`src/layouts/Base.astro`, dev only — `import.meta.env.DEV`) finds `#emdash-toolbar .emdash-tb-inner` and adds
buttons before the close button. A `MutationObserver` re-attaches them if the pill is re-rendered.

- **Buttons:** X-ray (outlines blocks, `data-emdash-ref` fields and `astro-island`s, with label chips), Inspect
  (hover tooltip; a click opens the comment box), Notes (comments per page, pins, **Copy prompt** for an AI agent, Done
  section; the prompt is built in `prompt.ts` and points CMS fields at the EmDash MCP tools), Audit (axe-core + SEO + performance checks, click a row to
  scroll to the element), Errors (script errors, failed requests, console output, with a badge).
- **Notes are rows of the `feedback` collection** (`feedback-api.ts`, `feedback-store.ts`), not localStorage: the prompt
  carries each row's id as the **Comment ID** and tells the agent to set `state` to `done` (or `wontfix`) with a
  `resolution`; the page polls every 4 s while visible, drops the pin, shows a toast and lists it under Done. The field
  is `state` because `status` is EmDash's own draft/published column. The collection is **not** in the production `seed/seed.json`: it is described in `seed/dev-tools.json` and `pnpm seed`
  (dev login only) creates it through the schema API. Without it Notes reports `MISSING` and shows the command. Create
  it by hand with `pnpm exec emdash seed seed/dev-tools.json --no-content`. The CLI line in the prompt carries `--draft` and `--url` (the
  CLI needs `--rev` from `content get`); without `--url` it targets another port.
- **The Notes prompt is schema-aware.** On Copy it reads the live schema (`/_emdash/api/schema/collections` and
  `…/<slug>?includeFields=true`, session cookie + `X-EmDash-Request: 1`) and, per comment, says whether the element is
  already a CMS field (content only), has an existing field that fits (page collections only, from
  `collectionsOnPage()`), or needs a new field; `field-hints.ts` guesses the wanted kind from the words (EN + PL). Link
  fields are `url` only — a `string` title is not a link field. The clipboard gets the prompt as a promise.
- **Hide, not close:** EmDash's × sets `localStorage["emdash-toolbar-dismissed"]`, removes the pill, clears the
  `emdash-edit-mode` cookie and reloads — the pill only came back after a visit to the admin. The add-on intercepts the
  click (capture phase on the pill) and collapses it into a round handle instead; click the handle or press
  **Alt+Shift+E** to show it again. State lives in `localStorage["emdash-dev-tools:collapsed"]`. A pill closed the old
  way is restored on the next page load (flag cleared, one reload).
- **Source file in Inspect:** only shown when Astro annotates the DOM (`data-astro-source-file`), which needs
  `devToolbar.enabled: true`; it is off in `astro.config.mjs` because Astro's own bar sits at the same spot.

## Traps

- **EmDash's click handler runs first.** In edit mode it listens on `document` (capture phase, registered before our
  script) and opens its own inline image editor / starts text editing. Anything that must take a click away from it has
  to listen on `window` (reached earlier), not `document` — see `inspect.ts` and its test.

- **Images 500 from `/_image` ("Could not find Sharp")** — the app must list `sharp` itself; Astro's image service does
  not find it through the pnpm store. It is pinned to `0.34.5`. The Errors panel is how this showed up.
- **Verify in a browser, not with curl:** the pill is not in the HTML for anonymous requests. Sign in with
  `/_emdash/api/setup/dev-bypass?redirect=/posts`, set the cookie `emdash-edit-mode=true`, then open a post.
- Toggling Edit mode reloads the page, so scripts evaluated across it lose their context.
- X-ray labels are a separate layer of positioned chips, not `::after`: a `position: relative` on labelled elements
  would break the sticky site header.
