# Soft corners, a category bar and a dialog for the shop filters

Date: 2026-11-15 · Supersedes: the "square corners everywhere" rule of `2026-11-15-wireframe-skin.md` (and the radius check in
`wireframe-lint`). Its rules against shadow, gradient, blur, motion and uppercase stand.

## Context

The shop listing worked but read as a form: a full-width, always-open accordion (Availability, Brand, Price) pushed the
products about 600 px down, the price inputs were large empty boxes, there were no category links, brand held one value
although it rendered checkboxes, the applied filters never showed as chips (`filtersProps` did not pass them) and every
product card sat in a 1 px box. The product page and the home hero were boxed and uneven in the same way. The owner asked for
a simple, well laid out, fresh and minimal UI based on the UX notes in their Notion knowledge base (the Wróbel e-book packs
"Listing i kategorie", "Nawigacja i wyszukiwarka", "Karta produktu", "Mobile", and the "Filtry na telefonie" and
"Puste wyniki i błędy" specs).

## Decision

- **Corners are soft.** `--radius-card` and `--radius-panel` are 20 px, `--radius-field` 12 px, `--radius-control` and
  `--radius-chip` are pills. `wireframe-lint` no longer requires radius tokens to be `0`; `border-radius` in a component must
  still be a token. Borderless rounded tiles replace boxed cards.
- **Category bar above the listing** (pill links, one row, wraps on desktop and scrolls on a phone), also as pills under the
  home hero. Source: category links above a listing raised conversion in the e-book's cases, and they must be visible without
  opening a menu.
- **One dialog for the filters.** The same `<dialog>` is a right-hand drawer from 768 px and a full-screen sheet below it.
  Groups are Availability (a switch), Size (chips), Brand (checkboxes with counts, multi-select), Price (preset segments).
  Applying is the "Show N results" button, whose N and every option count update live while the panel is open. Without
  JavaScript the panel renders inline as a plain GET form. Applied filters are removable chips in the toolbar.
- **The page filters, not the API.** `/shop` fetches the whole catalog (the plugin API takes one brand and no sizes) and the
  pure function `features/catalog/domain/facets.ts` applies the state on the server and in the browser, so counts and the
  grid cannot disagree.
- **Product page:** variants on top, the strongest promises (delivery with a date range, returns, payment) next to the CTA,
  accordions instead of a tabbed block, a bundle shows what it includes and the saving, a sticky mobile bar once the button
  scrolls away, "Adding… / Added" feedback.
- **Home:** one hero with one primary CTA and category pills, fewer rails (New arrivals, Sale, Bundles), consistent rail heads.

## Alternatives

- Keep square corners and only restyle: rejected, the stiff boxes were half of the "generic" look.
- A sticky sidebar on desktop: rejected, 20 products do not need a permanent column and it costs the grid a quarter of its width.
- Popover dropdowns per facet on desktop: rejected, two interaction models to build and keep accessible; one dialog serves
  every width.
- Auto-submit on every change: rejected on the dialog, the page would jump while someone chooses.

## Consequences

- A shop with thousands of products cannot filter in the page: the listing would need a server-side facet query.
- The design system is no longer a strict wireframe; a new component must still use only tokens.
- URL state changed: `?category`, repeated `brand` and `size`, and `price=min-max` (legacy `priceMin` and `priceMax` still parse).
