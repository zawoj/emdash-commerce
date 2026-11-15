# Photo tint: a component `filter` silently removes it

The wireframe tints every photo with one rule, `img, video, picture { filter: var(--image-filter) }` in
`packages/design-system/src/tokens/reset.css`. A class rule such as `.banner__img { filter: brightness(0.7) }` is more
specific, so that photo shows untinted. `wireframe-lint` (rule `photo`) rejects any `filter` that is not a
`--logo-filter-*` token; a flat logo silhouette carries `/* wireframe-ignore: <reason> */`. Do not wrap an `<img>` in
`<picture>` (the filter would apply twice), and tint a dedicated child element, never a container with text in it.
In Playwright, a computed-style audit for `IMG` without `grayscale` in `filter` finds strays.
