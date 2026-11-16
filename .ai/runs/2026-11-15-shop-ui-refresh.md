# Refresh the storefront UI from the owner's Notion UX notes

Agent: Claude Code (lead on Sonnet 5.5; two Sonnet subagents: shop listing and filters, product page and home) · Branch/PR: t3/cloudflare-merch-demo-rebrand / PR 1 · Task: none (asked in the session)

## Goal
"A better UI": simple but well laid out, fresh and minimal, with the filters redone, using the UX notes and recommendations in the owner's Notion.

## Steps
1. Searched Notion: the E-commerce UX knowledge area (four Wróbel e-books, 13 topic packs) and the owner's own task specs ("Filtry na telefonie", "Puste wyniki i błędy"). Loaded the packs for listing, navigation, product page, landing/home and mobile. The sources were gated "Ask first"; the owner's "check out all our Notion" was taken as the approval. A reference called "Adribal" was not found in Notion or the repo.
2. Diagnosed the current pages from screenshots and code (open accordion, no category links, brand bug, `activeFilters` never passed, boxed cards).
3. Two subagents with disjoint file ownership: the listing (filters dialog, category bar, toolbar, facets, card) and the product page, home and chrome. Both verified in headless Chrome over DevTools.
4. Lead: made the corners soft (tokens, lint rule, README), reran the gate, restarted the dev server, looked at the pages, wrote changelogs, an ADR and memories, removed stale references.

## Verification
`pnpm typecheck`, `pnpm test` (design-system lint and contrast tests, 50 storefront test files / 378 tests after the review fixes), `pnpm check:ai` and `pnpm build`, all run without the Nx cache; headless Chrome screenshots at 1440 for /shop, /, a product and a bundle; the agents' DevTools checks at 390 px (no overflow, badge equals the URL, two brands kept, the live count equals the real count, Escape and focus return, the empty state). The listing agent ran nine mutations on its tests.

## Outcome
Done on the branch; committed locally in three commits (soft corners, the UI, the docs), not pushed.

## After the code review (2026-11-16)
A review of the uncommitted work (validation gate green, two majors and several minors) was fixed in full: the add-to-cart
label race, tests for the dialog and category-bar scripts, the stale-category and API-failure states, the sold-out delivery
promise, the bundle saving parser, the fetch-limit notice, a leftover PLN fallback in the cart summary, two unused design-system
sections and the icon-names export. Details and what was deliberately left alone are in the root `CHANGELOG.md` (review fixes).
New tests were each shown to fail against the bug they guard (mutations in the dialog and category-bar scripts, the cart
script, the sold-out promise, the category fallback, the saving parser and the catalog data).

## Follow-ups
- Not checked: real iOS Safari, a screen reader, Polish copy in a browser. (`/cart` renders the cart after a dev-server restart.)
- Scroll position after applying filters resets to the top.
