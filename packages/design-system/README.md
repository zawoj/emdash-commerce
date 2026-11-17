# @emdash-commerce/design-system

Design tokens and every visual component of the EmDash storefront as props-driven Astro components.
This package owns **visuals only** — no data logic, no imports from any app. See [`CHANGELOG.md`](./CHANGELOG.md)
for what changed in the package itself and why.

## Install

```bash
pnpm add @emdash-commerce/design-system
```

Requires Astro 7 (a peer dependency). The package ships its Astro, TypeScript and CSS source; Astro and Vite compile it in
your site. Import the tokens once in a layout and use the components from the barrel:

```astro
---
import { Button } from "@emdash-commerce/design-system";
import "@emdash-commerce/design-system/reset.css";
import "@emdash-commerce/design-system/tokens.css";
---

<Button variant="primary" href="/shop">Shop</Button>
```

Client scripts are separate subpaths (`@emdash-commerce/design-system/mini-cart`, …) so a `<script>` never pulls in the
components. The demo storefront also lists the package under `vite.ssr.noExternal`; a plain install from npm builds
without it (checked with `astro build` on the packed tarball).

The `token-lint` and `wireframe-lint` binaries ship too (`pnpm exec token-lint src`). This package is a community
project for [EmDash](https://github.com/emdash-cms/emdash) and is not part of it.

The package is **de-branded**: no logos or brand photos; site chrome uses a text wordmark from `siteName`.

The look is a **warm ink + orange wireframe with no decoration**, in the Cloudflare palette: one warm neutral ramp
(`--ink-0`…`--ink-1000`, step 800 is the charcoal `#404041`), one orange ramp (`--orange-50`…`--orange-900`, 500 is
`#F6821F`, 300 the amber `#FBAD41`), system font stacks (nothing is loaded), soft corners (`--radius-card` 20px for photos and tiles, pills for anything you tap), 1px outlines (2px for emphasis: selected, invalid, danger), no shadow, no gradient, no blur, no transition,
transform or animation, and sentence case in normal width. Orange is the accent: a **fill with near-black text**
(`--accent` / `--on-accent`, 7.2:1; white on `#F6821F` is only 2.6:1), the default solid button and selected control
(`--action-primary`, `--control-solid` on the light surface). State is told by outline, border width, underline,
strike-through, marker shape and fill inversion, never by colour alone: a sale price is a `<del>` plus the dark-orange
price (`--hot`), an error is a 2px border with an icon. Photos show as shot (`--image-filter: none`; one global filter
on `img, video, picture` in `reset.css` if a skin wants a tint again); the scrim under copy on a photo is one flat
charcoal layer. Tokens live in `src/tokens/index.css`; shared glyphs live in `src/assets/` (play icon, social SVGs).

A few tokens exist only so components keep compiling and are neutral on purpose (`--text-case`, `--label-case`,
`--tracking-*`, `--*-stretch`, `--duration-collapse`): `none`, `0`, `100%`, `0ms`.

Contrast roles (checked with real WCAG maths by `scripts/token-contrast.test.mjs`, both surfaces):

- `--ink-500` is the lightest step with 3:1 on white (form borders, `--border-strong`); `--ink-600` the lightest with
  4.5:1 (secondary / muted text); `--ink-400` is for disabled text only. `--border` is a decorative hairline.
- Orange on a light surface is a **fill, never text or a thin stroke**: text uses `--accent-text` (`--orange-700`,
  5.3:1 on white; amber `--orange-300` on dark) and a stroke that marks state (current nav item, selected thumbnail,
  ticked box, marker outline) uses `--control-edge` (charcoal on light, white on dark). `--hot` is `--orange-700`, the
  fill behind white `--on-color` text (5.3:1).
- `--on-action-primary` is the text on `--action-primary` (ink); `--on-color` (white) is only for the dark fills
  (`--hot`, `--category-tone-*`). Pressed buttons use `--accent-pressed` (amber) so the ink text keeps 4.5:1.
- The focus ring stays ink (an orange ring on white is 2.6:1); on the dark surface it is `--ink-50`. On the dark
  surface the solid control is inverted (white, ink text) and `--border-strong` is `--ink-500`.
- Category tones `--category-tone-1…8` are charcoals and dark orange-browns that keep white label text at 4.5:1.

## Why this package exists

- One design system for every app in the monorepo: there is no theme swapping and no
  theme/contract layer. Apps import the components directly.
- The architecture comes from a production content platform built on the `basic` starter: tokens →
  atoms → molecules → parts → blocks, one component per folder, closed variant vocabularies, no
  copy inside components.
- Plain CSS on tokens (no Tailwind): scoped Astro `<style>` blocks, fast and easy to steer from one
  token file.

## Scope

The package holds **every UI component**; an app only imports them and passes data. Components
are tiered:

- `src/tokens/` — design tokens, reset and the (empty by default) webfont file.
- `src/components/atoms/` — single components (button, label, tag…).
- `src/components/molecules/` — small compositions of atoms (tile title, search bar).
- `src/components/parts/` — building blocks several blocks share (article card, content tile…).
- `src/components/blocks/<group>/` — one folder per CMS layout block, named by the block's slug in
  kebab-case (`sections/latest-posts/` = blockType `latestPosts`): the whole section, props in,
  markup out. Groups follow the block's placements: `widgets/` (right bar), `left-bar/`, `heroes/`
  (only the top zone), else `sections/`; a group folder exists once it holds a block.
- `src/components/chrome/` — header, footer, partner strip, cookie banner, page grid.
- `src/types/` — prop shapes shared across tiers (`ImageAttrs`, `DisplayDate`, `LinkContent`).
- `src/utils/` — plain TS helpers (`categoryColor`) and client scripts (`balanced-clamp`).
- `src/assets/` — placeholder artwork (logo, brand mark, play icon, social glyphs) at the sizes the
  layouts were built for.

`apps/preview` renders the same components from fixtures: full page views under `/views/…`, the
gallery of the atoms and molecules under `/components/` and the gallery of the shared parts and
blocks under `/shared/` (`pnpm nx run preview:dev`, port 4322). A new or changed component gets a
fixture and a place in the preview — see `apps/preview/README.md`.

## Conventions

- One component per folder: `src/components/<atoms|molecules|parts|blocks>/<kebab-name>/index.astro`
  (+ a sibling file if the component needs more than the template, per the repo's 600-line rule).
  Next to it: `variants.ts` (vocabularies; for a block also its item-count constants, e.g.
  `LATEST_POSTS_LIMIT`, which the apps read) and `types.ts` (its content/prop types). Re-export
  every public component, vocabulary and type from `src/index.ts`; inside the package import
  relatively, never from the barrel.
- The package owns its prop types. A consumer shapes its data into them (one projection per card
  type); images arrive as ready `<img>` attributes (`ImageAttrs`, srcset + sizes chosen by the
  caller), dates as `DisplayDate` (`<time datetime>`).
- No copy in components: every visible or accessible string — link labels, headings, aria labels —
  is a prop, required where the component needs it (e.g. a tile's `more` link is `{ href, label }`).
- Client scripts are package subpaths (`@emdash-commerce/design-system/balanced-clamp`), imported from a
  component's `<script>`, never from the barrel (that would pull the components into the bundle).
- Variants and sizes are closed vocabularies as `as const` objects + derived union types, declared
  next to the component — never raw string literals in `Props`.
  ```ts
  export const buttonVariants = { primary: 'primary', accent: 'accent', cta: 'cta', inverse: 'inverse' } as const
  export type ButtonVariant = (typeof buttonVariants)[keyof typeof buttonVariants]
  ```
- Reference tokens with `var(--token-name)`; never hardcode a hex/px value that already has a
  token. If a value isn't tokenized yet, add it to `src/tokens/index.css` first.
- A card that leads somewhere and has no explicit button (or other clear sign that a click goes
  somewhere) is clickable as a whole, never only on its title. Build it as a stretched link: the
  card's ONE link is the title (so the accessible name is read once) and its `::after` covers the
  card (`position: relative` on the card root); any other real control inside the card (a button,
  a toggle) sits above the overlay (`position: relative; z-index: 1`) and stays independently
  clickable; never nest a control inside the `<a>`. Give the card a hover state (under
  `@media (hover: hover)`) and a focus ring around the whole card on `:focus-within` of the link
  (`:has(:focus-visible)`), cursor pointer, no geometry change. A card with an explicit CTA keeps
  the CTA as its target, unless every card of that kind in a list leads to the same place as its
  button (e.g. offer cards), where the whole card stays the link.
- Dark/light surfaces → `[data-surface="dark"]`. A dark tile sets the attribute on its own
  container instead of recoloring children.
- Code, comments, Props and file names in English; UI copy is the caller's concern (fixtures, the
  dictionary in an app), never hardcoded in a component.
- Category colours: a category is `CategoryRef` (`label` + `color` — any CSS colour, the CMS's
  hex — or a palette `key`, `tone-1`…`tone-8`, dark tones that hold white text); `categoryColor()` resolves it, `CategoryLabel`
  takes `color` or `category`. A CMS colour is the one data-driven value passed as a CSS custom
  property.

## Phone app shell (<= 767px)

On phones the storefront behaves like a shopping app; tablets and desktop are untouched.

- `TabBar` (chrome): five tabs fixed to the bottom; reuses the header's drawer, search and mini-cart openers by data
  attribute. Not rendered by the checkout.
- `ActionBar` (chrome): one primary action as a bottom bar that replaces the tab bar — always up (cart: total +
  checkout), or `watch`ing an element and coming up once it has scrolled out of the top (product: price + add to
  cart, `proxy` forwards the press to the real button, `mirror` keeps its price and label). `ListingFilters`
  `resultsLabel` and `CheckoutLayout` carry their own bottom bars on the same footprint.
- `BackLink` (atom): the "‹ parent" bar under the header; `Breadcrumbs` shows it instead of the trail and
  `CheckoutLayout` takes it as `back`.
- `chrome/bottom-bars.css` is the shared rulebook (which bar yields, `--bottom-bar-offset`, keyboard). A bar is
  `--tab-bar-height` / `--action-bar-height` plus `env(safe-area-inset-bottom)`; the page needs
  `viewport-fit=cover`. Traps: `.ai/memory/phone-bottom-bars.md`.

## Shop-the-look dialog (variant picker and kit stepper)

`ShopTheLook` takes an optional `dialog` (`LookDialogProps`) and a `choiceId` per item. With it a row's button opens
`LookDialog` on that product (`data-look-open`), and the look's button opens it in kit mode (`data-look-kit`); without it
both stay plain links. The dialog is one native modal `<dialog>` per look (focus trap, Escape, `aria-modal`, focus back to
the opener), a centred modal from 768px and a bottom sheet below with the step buttons at the bottom (safe-area aware,
the page behind does not scroll). Every product's panel is rendered by the server (the real `VariantPicker`, one `Price` per
distinct price, a photo per colour that has its own, a low-stock `Availability`), so the script only switches what is shown.

- Pure logic, tested in the web app (the package has no test runner): `utils/variant-availability.ts` (which values can be bought,
  which variant a choice names, what is still missing), `utils/look-kit.ts` (the stepper state machine, `addAll` with partial
  failure, money formatting). DOM: `utils/variant-choice.ts` (`syncVariantChips`, shared with the product page's buy box) and
  `utils/look-dialog.ts`.
- The cart is the app's: register it with `setLookCartAdapter({ add, onAdded })` (`add` answers `{ ok, message?, count? }`; `onAdded`
  gets the count and whether to open the mini-cart). The dialog never knows an endpoint.
- Radio groups of different products share a name (`option:size`); every panel is its own `<form>` so they stay separate.

## Tokens are mandatory

Every value that has a token is written as the token — colors (`var(--ink-500)`, or the
semantic alias such as `var(--text-muted)` or `var(--accent)` when that is what it means), spacing
(`var(--space-24)`), radius — the semantic ones (`var(--radius-card)` for cards, photos and tiles,
`--radius-control` for buttons and pills, `--radius-field`, `--radius-chip`, `--radius-panel` for
floating panels) — and text styles: every text style is one token, `font: var(--type-display-sm)`
(+ `letter-spacing: var(--tracking-*)` where the style tracks), line heights rounded to whole pixels.
Three voices, each with its case and width (the `font` shorthand resets `font-stretch`, so set it
after `font`):

- display headings: `text-transform: var(--text-case)` (uppercase) and `font-stretch:
  var(--display-stretch)` (`--display-stretch-card` inside cards), `--tracking-display` from
  display-md up;
- labels, badges, eyebrows, table heads: `--type-label-caps-*` with `text-transform:
  var(--label-case)`, `font-stretch: var(--label-stretch)`, `letter-spacing: var(--tracking-label)`;
- buttons: `text-transform: var(--button-case)` (sentence case); body, form copy and nav links set
  no transform. Product names use `--type-title-md` / `--type-title-sm`, never condensed caps.

`--accent` is a fill with `--on-accent` text — never text or a stroke on a light surface (`--accent-text`, `--control-edge`).

`wireframe-lint` (`scripts/wireframe-lint.mjs`, also run by `test`, over this package and `apps/storefront/src`) fails on
anything that decorates: a `border-radius` other than `0` or a token, any `box-shadow`, gradients, blur, uppercase,
non-zero tracking, rotate / skew / scale, `transform` other than centring, `@keyframes` / `animation` / `transition`,
raw colours outside the tokens, webfonts and a `filter` on a photo. In `tokens/index.css` it also fails a hex colour that
is neither grey nor warm (hue 15-45 degrees: no blue, green, red or purple), a `--hot` that is not `var(--orange-700)`,
a non-zero radius or tracking and a gradient scrim. `scripts/wireframe-lint.test.mjs` proves each rule against the
fixtures in `scripts/fixtures/wireframe/` (a blue ramp fails, orange and charcoal pass). A line ending in
`/* wireframe-ignore: <reason> */` is skipped (only the one-colour logo silhouette uses it).

`scripts/token-contrast.test.mjs` (no dependencies) parses `src/tokens/index.css`, resolves the `var()` chains and asserts
the WCAG contrast of the text / background pairs (4.5:1) and of border, edge and focus tokens (3:1) on `[data-surface='light']`
and `[data-surface='dark']`: change a colour token and it tells you which pair broke.

`token-lint` (this package's bin, `scripts/token-lint.mjs`) enforces it on `.astro` styles and CSS:
the package's `test` script runs it, so `pnpm test` / CI fail on a raw value that has a token. A value with genuinely no token stays raw with a trailing
`/* token-lint-ignore: <reason> */` on that line.

## Re-skinning

1. Palette (`--ink-*`, `--orange-*`), the semantic radii, borders, `--image-filter`, `--image-scrim` and the `--logo-filter-*`
   silhouettes in `src/tokens/index.css` (`--accent` / `--on-accent`, `--control-solid`, `--hot`, `--link`,
   `--category-tone-*` and the surface aliases are the semantic layer every component reads). A skin with another hue
   or a decoration has to relax `wireframe-lint` (the warm range and the `--hot` step) first; keep
   `token-contrast.test.mjs` green.
2. Fonts: `src/tokens/fonts.css` is empty on purpose; to load a webfont import it there and point `--font-display` /
   `--font-body` at it.
3. Artwork: replace the files in `src/assets/` (keep the exported sizes, or update them in `artwork.ts`). Site chrome
   uses `SiteWordmark` (text from `siteName`).
4. Never put a `filter:` on a photo in a component: a class rule beats the reset's tint and the photo shows untinted.

## Consuming

```astro
---
import { Button } from '@emdash-commerce/design-system'
import '@emdash-commerce/design-system/reset.css'
import '@emdash-commerce/design-system/fonts.css'
import '@emdash-commerce/design-system/tokens.css'
---
<Button variant="primary" size="sm">Subscribe</Button>
```

A block takes its data as props, labels included — `items` is `ArticleCardContent[]`, `more` a
`LinkContent` (`{ href, label }`):

```astro
---
import { LatestPosts } from '@emdash-commerce/design-system'
---
<LatestPosts heading="Latest" headingId="latest-posts" items={cards} more={more} />
```
