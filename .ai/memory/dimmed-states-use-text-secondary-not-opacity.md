# Dimmed states: fade the photo, colour the text

A sold-out `ProductCard` and an unavailable `CartLine` were dimmed with `opacity: 0.6` / `0.55` on the title, name and price.
Opacity blends the text with the surface, so the contrast dropped below WCAG AA (4.34:1 and 3.73:1) and axe `color-contrast`
failed; the specs had to exclude both states (`test.fixme`). The fix: `opacity` only on the `<img>` (never a `filter`, see
`wireframe-photo-tint-trap.md`) and `color: var(--text-secondary)` on the text. A scoped child component such as `Price` keeps
its own colour, so reach it with `:global(.price)` under the state class.

Two traps for the test: the strict check proves nothing unless the state is on the page (assert `.product-card--sold-out` /
`.cart-line--unavailable` first), and an unavailable cart line exists only without a Stripe key (nothing is synced); with a
sandbox key the line is purchasable. Other `opacity` on text that axe does not flag today (disabled controls, a disabled
choice-list item, the prose gallery thumbs, a skipped look-dialog row) are exempt from contrast checks (disabled) or images.
