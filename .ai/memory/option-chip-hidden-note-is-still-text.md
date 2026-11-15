---
name: option-chip-hidden-note-is-still-text
description: Toggling a visually hidden status note with the hidden attribute leaves its text in the DOM - render it only when the state is true
---

# A hidden status note is still text

The option chip used to render `<span class="option-chip__note" hidden>Sold out</span>` on every chip and toggle `hidden`.
`textContent`, scrapers, tests and some assistive tech still read it, so every in-stock chip "contained" Sold out.

- The note is created and removed with the state: server render in `option-chip/index.astro`, client in
  `setSoldOutNote` (`packages/design-system/src/utils/sold-out-note.ts`), called by `syncVariantChips` for both the
  product page and the "shop the look" dialog.
- The chip carries `data-sold-out-label` so the script knows the words; the note text is `, sold out` so the accessible
  name is "XL, sold out".
- Same trap for any "status" span: prefer not rendering it over `hidden`.
