# Storefront skin: the zavcode blue wireframe, enforced by a lint

Task: none (agreed in the working session).

## Context

The storefront's design system wore a "volt sportswear" skin: lime accent, Archivo variable font in three widths, uppercase
display type, pill controls, shadows on floating panels, a gradient scrim, hover zoom and slide animations. The zavcode
design system (a sibling project) is a blue wireframe with no decoration. Both packages share one token vocabulary, so the
change is mostly a value swap.

## Decision

- `packages/design-system` keeps its token names and takes zavcode's values (ink ramp, type scale, radii 0). Extra tokens our
  components read stay as neutral aliases (`none`, `0`, `100%`, `0ms`) instead of touching ~100 files.
- Remove all transitions, transforms (except marker centring), keyframes, shadows, radii, gradients, blur, uppercase, tracking,
  red (sale price and errors are told by `<del>`, a 2px border and an icon), and the Archivo webfont.
- Photos: zavcode's single global tint (`--image-filter` on `img, video, picture`); no local `filter` may override it.
- Hero and banner stay text over a photo, with a flat ink scrim and light copy, at normal type sizes. Marquees are static.
- Contrast deviations from zavcode: form borders use `--ink-500`; the focus ring on a dark surface is `--ink-50`.
- `scripts/wireframe-lint.mjs` (run by the package `test`, covering package and app CSS/Astro) keeps it that way; a
  fixture test proves each rule fires.

## Alternatives considered

- Copy zavcode's token file wholesale: loses ~30 tokens components read, forces a codemod over ~100 files for no visual gain.
- Rotate the disclosure chevrons and allow-list it: a documented exception in the lint; swapping a glyph needed no exception.
- Allow inset `box-shadow` rings for outlines: each one became a `border` or `outline`, so the lint can say "no shadow" flatly.

## Consequences

- Prop and tone names keep the old "volt" wording (`voltText`, `brandMarqueeTones.volt`): renaming is API churn for later.
- Blog pages keep the template's neutral grey colours (only radii, shadows and tracking are zeroed): not yet on the ink ramp.
- Scroll behaviour stays `smooth` in a few scripts (they honour reduced motion).
