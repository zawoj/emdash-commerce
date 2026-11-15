# Photo tint: a component `filter` silently removes it

The design system styles every photo with one rule, `img, video, picture { filter: var(--image-filter) }` in
`packages/design-system/src/tokens/reset.css` (`--image-filter` is `none` in the Cloudflare skin, but it is still the one
place a tint goes). A class rule such as `.banner__img { filter: brightness(0.7) }` is more
specific, so that photo ignores the global value. `wireframe-lint` (rule `photo`) rejects any `filter` that is not a
`--logo-filter-*` token; a flat logo silhouette carries `/* wireframe-ignore: <reason> */`. Do not wrap an `<img>` in
`<picture>` (the filter would apply twice), and tint a dedicated child element, never a container with text in it.
In Playwright, a computed-style audit for `IMG` whose `filter` differs from `--image-filter` finds strays.
