# Changelog — @emdash-commerce/design-system

Newest on top. Each entry says what changed in the package and why.

## 2026-11-17

### feat: optional e2e hooks on cart lines, order summary rows and order confirmation
- `CartLine` sets `data-testid="cart-line"` on each row; `SummaryRow.testId` renders on the value cell; `OrderConfirmation`
  accepts optional `textTestId` and `numberTestId` so the storefront success page can poll without `innerHTML`.

### fix: OrderSummary drops the empty thumbnail column when no line has a photo
- Every line used to reserve a 56 px thumbnail box, so an order shown without photos (the guest order page knows titles and
  amounts only) had a column of blank squares. When no line carries an `image` the box and its grid column are gone.

## 2026-11-16

### chore: remove two unused sections, export the icon names
- `ActivityIndex` and `BrandMarquee` (and `brandMarqueeTones`, their types) are removed: the home page stopped using them with
  the `ShopHero` redesign and nothing else did. `CollectionBento`, `ProductGrid` and `CategoryTile` are also not used by the
  storefront and stay.
- New export `@emdash-commerce/design-system/icon-names` (the icon name vocabulary without the Astro component barrel), for code
  that must stay importable from a plain TypeScript test.
- The `listing-filters` and `category-bar` scripts are covered by tests, run from the storefront because this package has no
  DOM test runner (`apps/storefront/src/features/catalog/client/listing-dialog.client.test.ts`).

## 2026-11-15

### feat: soft corners, a filter dialog, a category bar and calmer product and home blocks
- **Corners.** `--radius-card` and `--radius-panel` are 20 px, `--radius-field` 12 px, `--radius-control` and `--radius-chip` pills
  (`--radius-xs…lg` 4, 8, 12, 20 px, `--radius-full` 999 px). `wireframe-lint` no longer requires radius tokens to be `0`
  (a component `border-radius` must still be a token); shadow, gradient, blur, motion and uppercase stay banned.
- **New:** `CategoryBar` (pill links, `./category-bar`), `ActiveFilters` (removable chips, also used by the empty state),
  `ListingGrid`, `BundleIncludes`, `ShopHero` (replaces `BoardHero`, removed).
- **`ListingFilters`** is a modal `<dialog>`: a drawer from 768 px, a full-screen sheet below. Group kinds are `switch`,
  `chips`, `checkbox` and `segmented`; the `range` kind and the details accordion are gone; renders inline without a script.
  **`ListingToolbar`** is the Filters button with a badge, the chips and the sort: its `filterToggle` and `resultCount`
  props became `filters`, `activeFilters` and `clearAll`. `ListingIntro` gained `meta`, `EmptyState` a default slot.
- **`ProductCard`** is borderless: a rounded photo, text below, regular-weight title, quiet markers.
- **`ProductDetails`** is accordion rows on `Disclosure` (`descriptionLabel` replaces `tabLabels`; `readMoreLabel`,
  `readLessLabel` and `productDetailsTabs` and `utils/product-details.ts` are gone). `PromiseList` gained `columns` and a
  `detail` line, `ProductRail` a new head (title left, "View all" right), pill tabs and a peeking card, `ProductGallery`
  is borderless with a peek. `ProductSpotlight`, `Banner`, `Newsletter` (its `eyebrow` is optional) and `Faq` are tiles.
  `ActivityIndex` and `BrandMarquee` remain but the home no longer uses them.
- **Chrome.** Wordmark `max-width` 12 rem (a phone showed "Cloudflare Merc…"), the tab bar's current mark no longer shows
  through the action bar, and the dead `details[data-listing-filters]` selector is gone from `bottom-bars.css`.

### feat: Cloudflare palette (orange on warm charcoal), replaces the blue wireframe ink
- The skin is now a warm ink + orange wireframe taken from the Cloudflare merch look: the `--ink-0…1000` ramp is warm
  neutral (800 is the charcoal `#404041`), a new `--orange-50…900` ramp holds `#F6821F` (500) and the amber `#FBAD41`
  (300). Token names are unchanged; every other wireframe rule stays (square corners, 1px outlines, no shadow, gradient,
  blur, motion or uppercase, system fonts, state never by colour alone).
- `--accent` is orange-500 with `--on-accent` ink (7.2:1; white would be 2.6:1), `--accent-hover` orange-600,
  new `--accent-pressed` amber. `--action-primary` / `--control-solid` are the orange accent on the light surface (primary
  buttons, selected chips, current steps, pagination), with the new `--on-action-primary` text token; on a dark surface
  the solid control stays inverted (white, ink text). `--hot` is the dark `--orange-700` (5.3:1 on white, white text on it
  holds 4.5:1), still told by `<del>`, a 2px border and an icon.
- New `--accent-text` (orange as text: `--orange-700`, amber on dark) and `--control-edge` (charcoal / white strokes that
  mark a state: current nav item, selected thumbnail, ticked checkbox, current marker outline), because orange on white
  is under 3:1. Components that read them: `tag-posts`, `order-confirmation`, `account-nav`, `product-gallery`,
  `product-card` (sold-out outline), `order-progress`, `timeline`, `option-chip` (selected border), checkbox / radio /
  toggle `accent-color`. Pressed states of `Button` and the pickup-point button use `--accent-pressed` (they were ink,
  which would hide the ink label); `board-hero` markers and `product-card` badges use `--on-action-primary`.
- Photos show as shot: `--image-filter: none`; `--logo-filter-*` are plain charcoal / grey silhouettes (no hue rotate).
  The scrim is one flat charcoal layer. Category tones are eight charcoal and dark orange-brown fills (white text 4.5:1).
- Dark surface: `--text-muted` is `--ink-300` and `--border-strong` is `--ink-500` (the old values failed 4.5:1 / 3:1).
- `scripts/wireframe-lint.mjs` enforces the new palette (hex must be grey or hue 15-45 degrees, `--hot` is
  `var(--orange-700)`); its test and fixtures cover a blue ramp failing and orange passing.
- New `scripts/token-contrast.test.mjs` (in `test`): WCAG contrast of every text / background pair and of border, edge and
  focus tokens on both surfaces.
- Prop and tone names are unchanged (`voltText`, `brandMarqueeTones.volt`, `collectionTileTones.volt`): they are API.

### fix: option chips carry "Sold out" only when the option is sold out
- `OptionChip` rendered a visually hidden `Sold out` note on every chip, so the text of an in-stock chip contained it.
  The note now exists only for a sold-out option (server render and `syncVariantChips`, via `utils/sold-out-note`,
  exported as `./sold-out-note`) and reads `, sold out`, so the accessible name is "XL" versus "XL, sold out".

### fix: product gallery filter never leaves the gallery empty
- `product-gallery:filter` shows the chosen group's photos, else the untagged ones, else all (`product-gallery-core`,
  exported for tests).

### feat: blue wireframe skin, no decoration (replaces the volt sportswear skin)
- Look taken from the zavcode design system: a blue-tinted ink ramp, system fonts, square corners, 1px outlines, no shadow,
  gradient, blur, transition, transform or animation, sentence case. Tokens keep their names; values are overwritten and
  the extra tokens (`--text-case`, `--tracking-*`, `--*-stretch`, semantic radii) are neutral. Removed: `--volt*`,
  `--shadow-overlay`, `--ease-in*`, `--hover-zoom`, the oversized font sizes; `--hot` is ink (no red).
- Photos: one global `--image-filter` tint on `img, video, picture`; the scrim is one flat ink layer. Every local
  `filter: brightness()` that overrode the tint is gone.
- Sale price is `<del>` plus the ink price; errors are a 2px ink border and an icon, never red. Badges, status badge, count
  badge, promo card and coupon chip are flat outlined or inverted boxes.
- Hero and banner use the normal type scale (no oversized or stacked display type); marquees and partner rows are static;
  disclosure chevrons swap a `chevron-up` glyph instead of rotating (new `iconNames.chevronUp`).
- Hotspot and spotlight markers are square numbered ink-outline boxes that invert when active. The look dialog and mini-cart
  have a 1px border and no radius, shadow, slide animation or grab handle.
- The Archivo webfont dependency is removed. `details-motion` skips the animation when `--duration-collapse` is `0ms`.
- New `scripts/wireframe-lint.mjs` (run by `test`, with a fixture test) fails on any of the above coming back.
- Deviations from zavcode, for contrast: `--border-strong` is `--ink-500` (form borders 3:1), the dark-surface focus ring
  is `--ink-50`.
- Prop and tone names are unchanged (`voltText`, `brandMarqueeTones.volt`, `collectionTileTones.volt`): they are API.

## 2026-11-13

### fix: LookDialog kit steps for products without variant axes
- Axis-less products record their sole sellable variant when their step is shown; kit navigation refreshes the next step so Next can advance through Run Cap and Run Socks. `variantPickId` centralises the pick id.

### fix: BoardHero display line fits its tiles without horizontal overflow
- Board line type uses `pre-line`, a container-relative `max-width`, and slightly reduced `cqw` caps so short volt/black copy does not spill past the tile at tablet and phone widths.

### fix: LookDialog kit summary — totals, labels, and buy-set action
- Kit picks sync only for the active step (no silent default selections for later products), so the summary total matches chosen lines only; undecided rows show `notChosen`.
- Summary footer adds outline `buySet` beside `addAll`; copy gains `notChosen` and `buySet`.

### fix: ShopTheLook hotspots open the look dialog
- Hotspots now carry `data-look-open` / `data-look-for` like row actions when a `dialog` is configured.

### feat: initial import (de-branded)

- Imported the volt sportswear design system as `@emdash-commerce/design-system` for the EmDash storefront.
- No logo SVGs or brand-mark assets; header, footer, and `BoardHero` render a condensed uppercase `SiteWordmark` from the `siteName` / `brandName` props instead.
- Package imports use `@emdash-commerce/design-system`; tokens, volt palette, Archivo, and components.

## 2026-11-11

### feat: TurnstileSlot — the place of a Cloudflare Turnstile widget in a form
- New `parts/turnstile-slot` (`TurnstileSlot`, type `TurnstileSlotProps`) and `utils/turnstile.ts` (`@emdash-commerce/design-system/turnstile`): the slot a form carries for the Managed widget in its `interaction-only` appearance, so nothing shows unless Cloudflare needs the visitor and then the challenge takes the row (`size: flexible`, the page's language). The script loads once, lazily (a slot near the screen, or a touched field of its form), keeps the form's `cf-turnstile-response` field current and renews an expired token. A submit that comes before the token is ready is held with a short status line (props `pendingText`, `errorText`) and sent when the token arrives; a widget that cannot run lets the form go and the server refuses it. A form that sends in place dispatches `turnstile:reset` after each attempt (a token works once). A challenge scrolls to the middle of the screen, clear of the phone's fixed bottom bars (`--bottom-bar-offset`). No copy inside; renders nothing without the app's site key.
- `ReviewForm`: a `captcha` slot above the submit button.
- Preview: `/components/commerce/` shows the status lines (drawn statically, no Cloudflare).

### feat: LookDialog — the shop-the-look variant dialog and kit stepper
- New `parts/look-dialog` (`LookDialog`, types `LookDialogProps`, `LookDialogCopy`, `LookProductChoice`, `LookPrice`, `LookVariant`): one native modal `<dialog>` per look. Single mode picks a variant of one product (photo per colour, `Price` with the Omnibus note, `VariantPicker`, low-stock `Availability`, size guide, "see details", add to cart); kit mode steps through every product ("Product n of N" + progress, next / skip / back), then a summary with "change" per item, the total and "add all". Centred modal from 768px, bottom sheet with a grab handle and the buttons at the bottom below (safe-area padding, page scroll locked, slide-up under `prefers-reduced-motion: no-preference`). All copy is props.
- `ShopTheLook`: optional `dialog` and per-item `choiceId`; with them a row's button (`data-look-open`) and the look's button (`data-look-kit`) open the dialog, without them they stay links.
- New utils: `variant-availability` (value availability, `resolveChoice`, `settleChoice`), `variant-choice` (`syncVariantChips`, shared with the product page's buy box), `look-kit` (pure stepper, `addAll` with partial failure, `formatMinor`), `look-dialog` (the DOM controller and `setLookCartAdapter`). Exports in `package.json`.
- Preview: `/views/look-dialog/` (fixtures `look-dialog.ts`), both modes at phone and desktop width.

### fix: a product with one photo fills the phone gallery
- `ProductGallery`: on phones a lone slide takes the full width; the 86% peek stays for two or more photos.

### feat: phone shopping-app chrome — TabBar, ActionBar, BackLink
- New `chrome/tab-bar` (`TabBar`, `tabBarActions`, `tabBarIcons`): five tabs, fixed to the bottom on phones (<= 767px), white with a hairline, 56px + `env(safe-area-inset-bottom)`, solid glyph and a short bar over the current tab, a count badge slot. Tabs reuse the header's openers (`data-site-drawer-open`, `data-site-search-open`, `data-mini-cart-open`); `drawer-script.ts` and `search-dialog.astro` now bind every opener on the page.
- New `chrome/action-bar` (`ActionBar`, `utils/action-bar.ts`, `action-bar-core.ts`): a page's primary action (caption, value, full-width primary button) that replaces the tab bar. `watch` shows it only once an element has scrolled out of the top of the screen (IntersectionObserver plus a scroll listener, because the observer alone misses a jump), `proxy` forwards the press to the page's own control, `mirror` keeps price / label / disabled in step with the buy box. `chrome/bottom-bars.css` holds the shared rules: which bar yields to which, the reserved space (`--bottom-bar-offset`, set on `<body>`), bars stepping aside while a text field is focused, `scroll-padding-bottom`.
- New `atoms/back-link` (`BackLink`): the app-style back bar. `Breadcrumbs` renders it on phones for the nearest linkable ancestor (`parent-crumb.ts`) and hides the trail; new optional `backLabel`. `PageMain` exposes `--page-main-padding-top` so the bar sits flush under the header.
- `SiteHeader`: up to 767px the search, account, cart and menu buttons are hidden and the logo is centred. `SiteFooter` and `CookieBanner` clear the bottom bar. `CheckoutLayout`: on phones the button row is fixed to the bottom (safe-area aware, no more floating in the middle of a short step), optional `back` prop renders the back bar and the row drops its own back link. `ListingFilters`: optional `resultsLabel` adds the phone's "Show results (N)" bar to the open panel.
- Tokens: `--tab-bar-height` 56px, `--action-bar-height` 72px, `--bottom-bar-offset`. Preview: tab bar on every shop view, action bars on `/views/product/` and `/views/cart/`, phone iframes in `/components/chrome/`.

### fix: promise strip and address form on phones and tablets
- `PromiseList` (strip): under 1100px three equal cells, icon above a wrapping line, no horizontal scroller cutting the last promise.
- `AddressForm`: a container query — below 1000px of form width the street is a full row and house / flat numbers split the next one, so the flat label stays on one line.

### fix: responsive and touch QA (phone, tablet portrait and landscape)
- Tablet layouts: `BoardHero` is photo + three brand tiles in one row from 601 to 900px (was a stretched phone stack); `ProductSpotlight` caps the stacked photo at 620px; `ShopTheLook` and `StorySplit` stay two columns down to 700px (look rows fold their action under the text up to 900px); `Faq` splits from 720px; `ChoiceList` hides the decorative glyph tile on phones so descriptions get a readable measure; `Breadcrumbs` wrap on phones instead of ellipsis stubs; `CheckoutLayout` bars use `--page-gutter`.
- Touch: under `pointer: coarse` text links (`ProductRail`, `TileTitle`, `VariantPicker`, `Breadcrumbs`, `ListingFilters`, `ShopTheLook`, `StorySplit`, `BoardHero`, `Faq`, `OrderCard`, `CheckoutRecap`, footer links, header logo), checkboxes/radios, pagination, scroll buttons, `sm` buttons and range inputs reach 44px. Inputs, the sort select and the newsletter field use 16px (no iOS zoom).
- Mega menu (`site-header/mega-menu.ts`): on a touch screen wider than 1100px the first tap on an item with a panel opens it, the second follows the link (before, a tap navigated and the panel never opened).
- Tokens: `--type-label-caps-xs` 11 -> 12px, `--type-label-caps-2xs` 10 -> 11px. `ProductCard` pins the price row to the bottom so prices line up in a row.

### feat: `ProductDetails` is three tabs (Overview | Specs | Manufacturer in English), new `Tabs` molecule
- New `Tabs` (molecules): WAI-ARIA tabs over named slots (`tab-<id>`): `role=tablist/tab/tabpanel`, `aria-selected`, `aria-controls`/`aria-labelledby`, roving tabindex, arrows/Home/End with activation on move, `#id` hash opens a tab. Label typography, solid `--text-primary` underline (grows with motion tokens, none under reduced motion), hairline under the bar, below 480px the labels drop to the normal font width so three short labels fit without scrolling (the bar still scrolls when a longer label overflows). Without the script: no bar, every panel visible and stacked under its own heading (visually hidden once the bar is on, and always when only one tab is left). Logic in `utils/tabs-core.ts` (tested in `apps/web`) and `utils/tabs.ts`.
- `ProductDetails`: tabs in the fixed order description, specification, manufacturer; a tab without content is not rendered, one tab left shows no bar. New required prop `tabLabels` (`productDetailsTabs` ids); removed `isCompact` and the accordion/sticky side column. Delivery and returns is not a tab: a compact block under the tabbed area. A long specification (> 8 rows) is two balanced columns from 1100px. The "Read more" clamp is measured again when its tab becomes visible.
- Preview product view: all tabs, plus a second instance with only specification and delivery.

### feat: `Faq` is a two-column split with an optional help card
- `Faq`: a third (sticky, `--header-height` offset) for the optional `eyebrow`, the display `heading`, an optional `intro` and the optional `help` card (`FaqHelp`: heading, text, a primary `Button`, a secondary text link); two thirds for the full-width accordion (no 800px cap, answers keep a readable measure). Phones stack heading, intro, questions, then the card (the aside is `display: contents`). Without `help` the left column holds heading and intro only. No longer wrapped in `ContentTile`; works on a `data-surface="dark"` band (the button flips to white).
- Exports `FaqHelp`; the preview gets `/views/faq/` (with the card, without, contact button only, dark surface) and the FAQ at the end of the store view.

### feat: manufacturer panel in the product details, spec rows that a script can follow
- `ProductDetails`: optional `manufacturer` panel (same shape as `specification`) rendered after the specification, before delivery; the preview product view shows one.
- `SpecRow` / `SpecTable`: optional `key` (rendered as `data-spec-key`) and `isHidden` (`hidden` on the row) so a script can rewrite or reveal a row (the Fusion facts follow the chosen variant). Values keep their line breaks (`white-space: pre-line`).

## 2026-11-10

### fix: wave 3 QA — cart line prices, phone filters, breadcrumbs, option chips, current menu item
- `CartLine`: the unit price renders as "N x price" only for a quantity above one; a single item shows its price once, in the line total (a price-change comparison moves there).
- `ListingFilters` / `ListingToolbar`: below 900px the panel's own summary row is hidden; the toolbar toggle opens and closes the panel with the details animation and keeps `aria-expanded` / `aria-controls`. The auto-submit forms drop blank fields (`formdata`) and a form with no field navigates to the bare path.
- `Breadcrumbs`: one line, middle crumbs shrink first with an ellipsis, the first and the current crumb keep their text.
- `OptionChip`: a `:disabled` chip is struck through like `--disabled` (a script can flip it); the sold-out note is always in the markup and `hidden` unless the value is sold out, so a script can toggle it.
- `SiteHeader` / `PrimaryNav`: `ChromeMenuItem.isCurrent` underlines the top item and sets `aria-current`.

### fix: search panel product names in normal case
- `SearchPanel` result titles use `--type-title-md` (a product name is never condensed caps), like every other item title.

### fix: browsing QA — footer overflow on a phone, "Read more" shown on a short description, compact product details
- `SiteFooter`: below 640px the link columns wrap their text (`white-space: normal`, list items `width: 100%` + `overflow-wrap: anywhere`),
  so the contact e-mail no longer pushed the page 7px wider than the viewport (every page scrolled sideways on a phone).
- `SiteFooter` between 1101px and ~1300px (five no-wrap columns plus a 96px gap) and between 640 and 1100px (legal row) no longer
  overflow: the column gap is `clamp(24px, 4vw, 96px)`, the columns and the legal row wrap from 1100px down; the phone grid gives
  its second column more room (`1fr 1.4fr`) so the contact e-mail stays on one line.
- `ProductDetails`: the "Read more" toggle was visible although the script had hidden it (`display: inline-flex` beat the `hidden`
  attribute) - on a text that fits it showed a button that did nothing. New optional `isCompact`: on a desktop a short description and
  the specification / delivery panels share one row of three equal columns instead of a lone text above empty space.

### fix: product spotlight keeps the photo's proportions
- The stage no longer crops the photo to 4:3 with `object-fit: cover` (that moved every callout, which is a percentage of the
  photo, off its feature on a portrait packshot). The photo keeps its own ratio from `image.width` / `height`, is at most 720px
  tall on a wide screen and is centred on the accent surface; on a phone it fills the width.

### feat: pickup-point picker offers the carrier's map widget; script-made results are styled
- `PickupPointPicker` gets `geowidget` (`PickupPointGeowidget`: token, script and style URLs, `config`, `language`, button
  labels): a "choose on the map" button (hidden until the script runs) that loads InPost Geowidget v5 on first open and turns
  its pick into the chosen radio (the pick is completed through the picker's own `endpoint?code=`). `pointFromGeowidget` maps the
  widget's ShipX-shaped point. Without `geowidget` nothing changes.
- Fix: the results the script renders (live search, the map pick) were unstyled because Astro's scoping attribute is not on
  elements created at runtime; the picker's `<style>` is `is:global` (its classes are BEM-prefixed).
- Preview: `/shared/commerce/` shows the picker with the map button (placeholder token, so InPost's widget reports a token error).

### refactor: Nike-style mega menu and full-screen drawer
- `site-header` primary-nav: no chevrons, hidden-until-focus disclosure button, touching hover areas; `mega-panel`: centred
  text columns (`minmax(180px, 226px)`, max 6 per row, `LONG_COLUMN_LINKS` splits a long column in two), per-column "All"
  link from `allLabel`, 30ms stagger, quick close; scrim blurs the page. `mega-menu.ts`: swap dwell, scroll/blur close.
- `mobile-drawer`: full-screen, slides from the right, third level for columns over `DRAWER_DRILL_MIN_LINKS`, content in
  a readable column on tablets. Preview fixture `shopMenu` is now a sportswear navigation (`shopMenuWithTiles` shows tiles).

### feat: mega menu on desktop, drill-down drawer on phone
- `ChromeMenuItem` gains `groups` (`ChromeMenuGroup`: label, optional href, links), `featured` (`ChromeMenuFeatured`, max 2)
  and `allLabel`; `children` still renders a flat menu as one column. New `HeaderDrawerCopy` and `SiteHeader` props
  `drawer`, `idPrefix`, `openMenuIndex` (gallery only: renders a panel open). New export `MobileMenuDrawer` (`staticLevel`
  for the gallery).
- Desktop (>= 1101px): one full-width panel under the bar (edge to edge, content on the page gutter), columns with
  link-style headings, "shop all", photo tiles with scrim and hover zoom, a page scrim. One panel at a time; hover
  intent 120ms in / 200ms out, switching between items is instant; the disclosure button, Enter/Space/Escape and
  Tab through the panel work; panel height and opacity 220ms with a staggered column fade; reduced motion is instant.
- Phone/tablet: the hamburger is a button that opens a full-height `<dialog>` drawer; level two slides in with Back,
  focus is trapped by the dialog, Escape and the backdrop close it, the page does not scroll behind it.
- `site-header/index.astro` split below 600 lines; behaviour in `mega-menu.ts` and `drawer-script.ts`.
- Preview: `shopMenu` fixture has columns and tiles; `/components/chrome/` shows both open panels and both drawer levels.

### fix: sticky footer and bands that meet it
- `reset.css`: `body` flex column with `min-height: 100dvh` (`100vh` fallback); `body > main` grows; `body > footer` /
  `.site-footer` never shrink; `html { overflow-x: clip }` (moved from `PageHero`).
- New convention `data-band` on a section's root (set on `Newsletter`, `BrandMarquee`, `Banner`, `StatusPage`,
  `DropCountdown`, `KineticHero`, `BoardHero`, `EventsFeature`): as the last section of `PageMain` it removes the
  bottom padding and breaks out to the full viewport width, so it meets the footer as one surface.
- `Newsletter`: side padding is the page gutter (the copy lines up with the header and the footer).


### feat: animated collapsibles, animated drawers and overlays that stay above zooming photos
- New `utils/details-motion.ts` (`@emdash-commerce/design-system/details-motion`, pure helpers in `details-motion-core.ts`):
  opt-in `data-details-motion` on a `<details>` animates open and close with the Web Animations API (height, content
  fade + 8px rise, `--duration-collapse` / `--ease-out`). A second click mid-run reverses from the current height,
  `name`-grouped accordions close their sibling with the same animation, and `[data-closing]` lets the chevron turn
  back at once. Reduced motion and no JS keep the native instant toggle. `toggleDetails(details, open)` is exported.
- Applied to `Disclosure` (so FAQ and the PDP questions), `ListingFilters` (panel + groups), `CouponForm` and the
  checkout phone summary toggle. `ToggleSection` reveals with a CSS grid-rows transition (markup: one `__reveal`
  wrapper). Chevrons sit in a 32px disc with a hover state; summary rows got hover states.
- Mini-cart drawer, header search panel, phone menu and desktop sub-menu now animate out as well as in (CSS
  `@starting-style` + `allow-discrete` for `display`/`overlay`; behind `prefers-reduced-motion: no-preference`).
- Fix: an overlay on a photo that zooms on hover vanished mid-transition (the scaled `<img>` gets its own compositing
  layer). Frames are `isolation: isolate`, the photo `z-index: 0`, overlays `z-index: 1` in `DealCard`, `VideoCard`,
  `ArticleCard`, `FeaturedCategories`, `CollectionBento`, `DropCountdown` and `BoardHero`.
- Tokens: `--duration-collapse` (280ms), `--ease-in`.

### feat: ProductDetails part; ProductCard hover image, size row and badge stacking fix
- New `ProductDetails` (`parts/product-details`): full-width product details area — long description in the default
  slot on a ~72ch measure (quiet h3/h4), optional `highlights`, a sticky side column with `specification` and
  `delivery` panels (always open on desktop, accordions on a phone), and a collapsed 420px view with a fade and an
  animated "Read more / Show less" button (`utils/product-details.ts`; without JS the whole text shows).
- `ProductCardContent`: optional `hoverImage`, `sizes` (`{ label, isAvailable }[]`) and `sizesLabel`. The hover photo
  cross-fades in with a gentle scale, the size row slides up over the photo (desktop hover only, `aria-hidden`; the
  available sizes are read as one visually hidden line); without them the photo zooms.
- `ProductCard`: the frame isolates its stacking and the badges sit at `z-index: 2`, so the sold-out badge no longer
  disappears while the zoomed photo's layer is animating; the title underlines on card hover.
- `ProductCard`: no size row on a sold-out product (every size would be struck through); the size row is a frosted
  bar (translucent white + blur) so the photo still reads under it.
- `ProductDetails`: on a phone its Specification / Delivery panels open and close with the shared `details-motion`
  animation (the attribute is toggled with the media query; desktop panels stay always open, unanimated).

### feat: account, orders and returns parts
- New `ThumbStack`, `OrderProgress`, `OrderCard`, `AccountLinks`, `ReturnList`, `ReturnRequest`.
- `OrderListItem`: `status`, `detail`, `images`, `moreLabel` (`statuses` only without a single status).
  `StatusBadge`: `variant` chip | line. `Button`: new `outline` variant (secondary actions on light pages, where
  `inverse` is white on white).

### feat: checkout, cart and discount parts
- New `SecureNote`, `CheckoutRecap`, `OrderConfirmation`; icons `lock`, `smartphone`, `gift`.
- `CheckoutLayout.summaryToggle` (folded summary on phones), `OrderSummary.savings`, `CartLineContent.previousLinePrice`
  / `savingsText`, `EmptyState.links` / `linksLabel`, `StatusPage.secondaryAction` / `search` / `links`.
- Coupon form: link → field + Apply, applied code as a removable volt chip with its saving, error under the field.

### feat: AuthShell and AuthState (auth pages), form field states
- `AuthShell` (parts/auth-shell): split layout, props `heading`, `lead`, `brand` (`eyebrow`, `headline`,
  `benefitsLabel`, `benefits[{icon,text}]`, optional `image` — black/volt board without it); slots default, `notice`,
  `links`. `AuthState` (`tone` success | error | pending, `title?`, `text`, `toneLabel?`, default slot = actions).
- `FieldCheckbox`: 20px box, `error` + `errorLabel` props; input/select/textarea: `:user-invalid` error border.
- Preview: `/views/auth/{login,register,forgot-password,reset-password,verify-email}/`.

### feat: homepage section library (store variants B–D)
- Ten new sections in `blocks/sections/`, all props-in (no copy inside), light and dark, 1440 → 390,
  motion behind reduced motion, exported from `src/index.ts`:
  - `BoardHero` — the brand board as a hero: campaign photo tile, volt "GO" block, black "KEEP GOING"
    block with the wordmark, product tile.
  - `KineticHero` — full-bleed dark hero with two giant lines and a motion-trail echo of the type;
    `treatment` native | negative (inverts a light studio photo into a dark X-ray look).
  - `DropCountdown` — launch band: title, `<time>` date, a live countdown (script
    `utils/drop-countdown.ts`; static date without JS, `liveLabel` once the date has passed), honest
    scarcity line, notify-me form; `tone` light | dark.
  - `ProductRail` — scroll-snap rail of `ProductCard`s that always shows the next card's edge, tab links
    and prev/next buttons (`utils/product-rail.ts`, hidden without JS, disabled at the ends).
  - `ProductSpotlight` — one product with numbered callouts on hairline leaders (positioned in %;
    a numbered list on phones), price, spec rows, one CTA + one link.
  - `ActivityIndex` — huge condensed rows with index numbers and counts; the hovered/focused row's photo
    wipes into a side slot (thumbnails on phones).
  - `CollectionBento` — 2×2 + wide + 2 small collection tiles, photo or volt/black text tiles.
  - `ShopTheLook` — lookbook photo with numbered hotspots linked to the look's rows (per-item add or
    choose-size, total, what is not included; `utils/shop-the-look.ts`, works as anchors without JS).
  - `StorySplit` — sticky photo + scrolling numbered chapters; `side` start | end.
  - `ReviewWall` — "Customer favourites": big average score, one featured quote with a customer photo,
    a column (phone: rail) of short reviews.
- Why: the owner wants more homepage layouts than the Nike-like baseline; the section rules follow the
  owner's e-commerce knowledge base (visible continuation, one primary CTA per section, 3–4 items per
  group, proof near the CTA, honest urgency).

### feat: storefront polish against nike.com/pl, fusionworld.com and the brand board
- Tokens: `--page-gutter` (16→48px), `--header-height`, `--utility-bar-height`, `--hero-height`,
  `--band-height`, `--stroke-thin/bold/bar`.
- `PageHero`: optional `image` (full-bleed photo hero on the scrim, copy bottom-left, huge condensed
  caps H1, volt + white pill CTAs, one-time rise-in behind reduced motion; eager, high-priority
  image) and optional `secondaryAction`. Without an image the text hero stays.
- `Banner`: with an image a full-bleed campaign band, without one a black band with a volt CTA.
- `FeaturedCategories`: 4:5 photo tiles with the name as a white pill on the photo.
- `ProductGrid` / `LatestPosts`: header row with the heading left and the "more" link right.
- `PromiseList`: new `strip` layout (one row, hairline dividers).
- New `BrandMarquee` (`text`, `tone` light | volt | dark): the board's scrolling "TRAIN HARD — GO FAR"
  band; read once by screen readers, static under reduced motion.
- `SiteHeader`: utility bar on `--surface-muted`, wordmark left / nav centred / icons right, 2px nav
  underline, light phone category bar. `SiteFooter`: the giant white wordmark across the content
  width above the legal row.
- `ProductCard`: markers ("New", "-23%") as a `--hot` text line above the title (always reserved, so
  a row's titles and prices line up), title clamped to two lines, availability shown only when low;
  only "Sold out" stays on the photo. Listing toolbar / filters, gallery (4:5, thumbnail rail) and a
  sticky purchase column on the product page.
- States: `:active` on buttons, icon buttons and steppers; field hover / focus / error rings.
  Notices, address cards, status badges and choice lists lose the outlined boxes (fills or
  hairlines only).

### feat: volt sportswear skin
- Tokens (`src/tokens/index.css`) rewritten: neutral `--ink-*` ramp; `--volt` / `--accent` with
  `--on-accent` (a fill only), `--accent-hover`; `--control-solid` / `--on-control-solid` and `--hot`
  flip per surface; `--surface-hover`; `--image-filter: none`, `--image-scrim`, `--shadow-overlay`;
  semantic radii `--radius-card` (0), `--radius-control` (pill), `--radius-field`, `--radius-chip`,
  `--radius-panel`; case tokens `--text-case` (uppercase, display only), `--label-case`,
  `--button-case`; width tokens `--display-stretch` (72%), `--display-stretch-card` (80%),
  `--label-stretch` (125%); new styles `--type-display-5xl`, `--type-title-md/sm`,
  `--type-text-medium-md`, `--type-label-caps-xs`, `--type-price-lg/md`; motion tokens; grid gaps.
- `fonts.css` loads Archivo Variable (weight + width axes) from `@fontsource-variable/archivo`.
- `reset.css`: an unstyled link (`:where(a)`) takes `--link`, underlined with an offset, instead of the
  browser's blue.
- Assets: a wordmark (`logo.svg`, `logo-light.svg`) and a `brand-mark.svg`.
- Every component restyled to the skin, CSS only (props, variants and copy unchanged): pill
  `Button` / `IconButton` / `SearchField` / `Tag`, 48px fields and option chips, `Price` with
  tabular figures and a `--hot` reduced price, volt `CountBadge` and photo badges, boxless
  `ProductCard` (4:5 photo on `--surface-muted`, `--type-title-md` name, hover zoom) and
  `ArticleCard`, light `SiteHeader` with dark utility and category bars, black `SiteFooter` with
  volt promo cards, photo-led heroes on the scrim, floating `MiniCart` / search / cookie panels,
  `CheckoutSteps` with expanded-caps labels, prose with condensed headings and a volt highlighter.
- Markup hooks only: `SiteHeader` sets `data-surface` light on the bar and dark on the top and
  category bars and uses the dark logo; `CookieBanner` is light with a `primary` reject button;
  `PageHero`'s dark tone uses the `accent` CTA; `EventsFeature`'s volt lead panel is
  `data-surface="light"`; the magnifying-glass lens is no longer filled (`--icon-lens` hook, none by
  default).

## 2026-11-09

### fix: storefront catalog, header and chrome (UX audit)
- `SiteHeader`: the main menu is its own `primary-nav` file. A top-level item with a second level gets a disclosure button
  (`aria-expanded`, Escape closes, a click or focus outside closes); its sub-links are tab stops only while the panel is
  open or hovered, so keyboard focus passes the menu in one stop per item. New optional `subMenuLabelTemplate`
  (`{label}`) names the buttons. The hamburger checkbox has an accessible name and is out of layout and tab order from
  1101px up; its focus ring is drawn on the burger below that. The phone's category bar shows a chevron scrim at the
  right edge while more links are out of sight and scrolls the current category into view.
- `SiteFooter`: column titles are `h2` (same look), so a page has no h1 to h3 jump.
- `CookieBanner`: "customize" is a text link next to reject and accept; on a phone the title is kept for assistive
  technology only, the text is small and the answers sit in one row, so the bar covers a fraction of the screen
  instead of stacked full-width buttons.
- `ListingFilters`: applied filters are chips above the panel, outside the `<details>`, so they stay visible while it is
  collapsed; the script now collapses the panel on a phone with or without applied filters (it stays open for the one
  reload a change in the open panel causes). Each group's fieldset is named by its summary (no duplicated hidden legend).
- `VariantPicker` script: `revealMissingVariant` focuses the first axis without a choice and, in it, the first chip a
  shopper can pick, never a sold-out one (falls back to the radio group).

### fix: checkout, cart and locale switcher parts added with the storefront (entries that were missing)
- `CheckoutLayout` (part): the checkout's two columns, the step as one `<form>` posting to `action`, the sticky order
  summary beside it (under it on a phone) and an `actions` slot that sticks to the bottom of a phone screen.
- `CartLines`: a visually hidden twin of the "update" button comes first in the form, so Enter in a quantity field
  updates the quantities instead of pressing the first line's "Remove".
- `LocaleSwitcher` (chrome): one link per language the page exists in, the current one marked; renders nothing for a
  page that exists in one language only.
- `Banner` (section): a promotion strip on the dark surface with an H2, text, one button and an optional photo.

### feat: commerce components for the storefront (cart, checkout, account, listing)
- Atoms `OptionChip`, `QuantityStepper`, `InlineNotice`, `StatusBadge`, `CountBadge`; molecules `VariantPicker`,
  `CartLine`, `FreeShippingProgress`, `CouponForm`, `Disclosure`, `ToggleSection`, `AddressCard`, `Timeline`,
  `AccountNav`, `PromiseList`; parts `ProductGallery`, `ListingFilters`, `ListingToolbar`, `SpecTable`, `MiniCart`,
  `CartLines`, `OrderSummary`, `CheckoutSteps`, `AddressForm`, `ChoiceList`, `PickupPointPicker` (carrier-agnostic),
  `OrderList`, `EmptyState`; sections `ProductGrid`, `FeaturedCategories`, `Faq`. State is never colour alone (glyph,
  outline style and words), every control is a native element and works without a script.
- Additive extensions: `ProductCard` (compare-at price, Omnibus note, badges, sold-out state), `Price` (`compareAt`, `note`
  slot), `Availability` (`isLow`), `SiteHeader` (`cart`, `account`, `categoryBar`, `isMinimal`), `FieldInput` (`error`,
  `passwordToggle`). New icons for the glyphs; token `--tile-breakpoint-2xl`.
- Client scripts as package subpaths: `quantity-stepper`, `count-badge`, `password-toggle`, `toggle-section`,
  `variant-picker`, `mini-cart`, `product-gallery`, `listing-filters`, `pickup-point-picker`. Cross-widget events:
  `cart:changed` (`detail.count`), `cart:open`, `quantity:change`, `variant:change`, `product-gallery:filter`,
  `pickup-point:select`.

## 2026-10-19

### feat: the starters' sections and shop parts — basic, ecommerce and marketplace render the DS
- New components for what the starters draw: `PageMain` (the page's `<main>` column),
  `PageHero` (a CMS page's eyebrow/H1/lead/action on the light or dark band), `PageContent`,
  `Contact`, `ImageBlock`, the shop's `Price`, `Availability`, `ProductCard` and `ProductDetail`
  (photos beside the H1 and price, with `availability` and `actions` slots for the app's live stock
  and cart). `CardGrid` is now exported.
- `SiteHeader`: an `actions` slot for app controls (search combobox, cart, language), the search
  dialog and the top bar are optional (`search`, `isTopbarVisible`). `SiteFooter` renders the legal
  nav only with links; `legalLabel`/`comingSoonLabel` are needed only with what they label.
- `StatusPage` can be a section inside an existing `<main>` (`isMain={false}`); `ArticleCard`'s date
  is optional (an undated page in search results); `Prose` styles a plain rich-text blockquote and
  image; `reset.css` ships a `.visually-hidden` utility.

### fix: `data-surface="light"` switches back to the light tokens inside a dark container
- The light semantic tokens were declared on `:root` only, so a light popover inside the dark header
  (the header's search dialog, the starters' search suggestions) stayed dark. They are now declared
  for `:root, [data-surface='light']`. Found by opening the starters' search suggestions live.

## 2026-10-18

### feat: blue wireframe with no decoration (owner, 2026-10-18)
- One blue ink scale replaces the grays; the scale is renamed `--neutral-*` → `--ink-*` so the name
  fits any colour.
- No decorative styling: every radius token is 0 (circles included), one system font for body and
  headings, `--text-case: none` instead of hardcoded uppercase, tracking tokens 0, no box/drop
  shadows, gradients (flat scrims stay where text sits on a photo), blur or rotation.
- Ornamental artwork removed with its API: backdrops, hero patterns (`HeroBand.pattern`,
  `HeroPattern`), the page glow (`PageGrid.glow`), the start-line calendar decoration
  (`EventsFeature.decoration`), the newsletter photo, the tags "#", socials watermarks, and the
  footer project cards' rotated marks, brand colour and tapes (`FooterProject.artwork/color/eyebrowLeft`,
  `promoMarkFromImage`).
- Photos are tinted into the ink (`--image-filter`), partner logos are ink silhouettes
  (`--logo-filter-ink` / `--logo-filter-muted`).

### feat: the package arrives as the monorepo's one design system, in a wireframe skin
- Ported from a production content platform built on the `basic` starter: its tier architecture
  (tokens → atoms → molecules → parts → blocks → chrome), component conventions and `token-lint`.
- Re-skinned as a wireframe: grayscale palette with a dark-fill accent, system font stacks
  (`fonts.css` loads nothing), 1px outlines, 0–4px radii, grayscale photos (`--image-filter`),
  neutral placeholder artwork (logo, brand mark, backdrop, hatch patterns) at the original sizes.
- Client-specific pieces removed: discipline labels/badges and icons, distance chips, the
  "Sprawdzone" wordmark/label/filter toggle, the Patronite widget, brand fonts and logos. Events
  keep a generic `isFeatured` flag (accent date badge) in place of the client's verified label.
- Category palette keys are neutral `tone-1`…`tone-8`.
