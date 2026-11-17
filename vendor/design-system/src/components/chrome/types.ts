// Prop types of the site chrome (header, footer, partner strip). The chrome holds no copy of its
// own: every label, link and logo comes in through these props.
import type { ImageAsset } from '../../types/asset'
import type { ImageAttrs } from '../../types/image'
import type { PluralLabelForms } from '../../utils/plural-label'

/** A link of the header or the footer. */
export interface ChromeLink {
  readonly label: string
  readonly href: string
  readonly isNewTab?: boolean
}

/** A column of the mega menu: a heading (a link when it has an `href`) and its links. */
export interface ChromeMenuGroup {
  readonly label: string
  readonly href?: string
  readonly links: readonly ChromeLink[]
}

/** A photo tile of the mega menu: an image under a scrim with an eyebrow, a title and a link. */
export interface ChromeMenuFeatured {
  readonly title: string
  readonly href: string
  readonly image: ImageAttrs
  readonly eyebrow?: string
  /** The words of the call to action ("Shop now"); the whole tile is the link. */
  readonly ctaLabel?: string
}

/**
 * A main-menu entry. With `groups` it opens a mega menu (columns, an optional "shop all" link, up to
 * two photo tiles); without them `children` is a flat list, shown as one column.
 */
export interface ChromeMenuItem extends ChromeLink {
  readonly children?: readonly ChromeLink[]
  readonly groups?: readonly ChromeMenuGroup[]
  readonly featured?: readonly ChromeMenuFeatured[]
  /** "Shop all clothing": a link to the item's own `href` under the columns; absent = no such link. */
  readonly allLabel?: string
  /** The visitor is on this item's page or on one of its sub-pages: the item is underlined and carries `aria-current`. */
  readonly isCurrent?: boolean
}

/** The words of the phone drawer's navigation. */
export interface HeaderDrawerCopy {
  /** Accessible name of the drawer dialog ("Menu"). */
  readonly label: string
  readonly closeLabel: string
  /** The back button of a second level ("Back"). */
  readonly backLabel: string
}

/** The header's cart link: a plain link to the cart page that a script upgrades to open the mini-cart. */
export interface HeaderCart {
  readonly href: string
  /** Accessible name of the link ("Cart"). */
  readonly label: string
  /** Items in the cart when the page was rendered; scripts keep it current via `cart:changed`. */
  readonly count: number
  /** Spoken count with `{count}` ("{count} items in the cart"). */
  readonly countLabelTemplate: string
  /** Spoken count per plural category of `countLocale` ("1 item in the cart"). */
  readonly countLabelForms?: PluralLabelForms
  /** BCP 47 tag that picks the plural category of the spoken count. */
  readonly countLocale?: string
  /** The id of the mini-cart `<dialog>` the link opens. */
  readonly miniCartId?: string
}

/** The header's account link ("Sign in" / "My account"). */
export interface HeaderAccount {
  readonly href: string
  readonly label: string
}

/** A main category in the phone's link bar; the current one is marked. */
export interface HeaderCategoryLink extends ChromeLink {
  readonly isCurrent?: boolean
}

/** The horizontal bar of the main categories under the header on a phone. */
export interface HeaderCategoryBar {
  /** Accessible name of the bar ("Categories"). */
  readonly label: string
  readonly links: readonly HeaderCategoryLink[]
}

/** One logo of the partner ticker. */
export type PartnerLogo = ImageAsset

/** The words of the header search dialog. */
export interface SiteSearchCopy {
  /** Accessible name of the search button, the dialog and the input. */
  readonly label: string
  readonly placeholder: string
  readonly closeLabel: string
  /** Shown while the query is empty or too short. */
  readonly emptyHint: string
  /** Shown when a query has no results. */
  readonly noResultsLabel: string
  /** The link under the results (to the search page, carrying the query). */
  readonly allResultsLabel: string
}

/** A static result row of the search panel (the live rows have the same shape). */
export interface SiteSearchResult {
  readonly type: string
  readonly title: string
  readonly href: string
  readonly image?: string
}

/** The header search: copy, the page the form submits to, and the endpoint that suggests results as the visitor types. */
export interface SiteSearch {
  readonly copy: SiteSearchCopy
  /** The search page: the form's action, and the target of "all results". */
  readonly action: string
  /** JSON endpoint answering `?q=&limit=` with `{ results: [{ title, href, typeLabel, image? }] }`; without it the panel only submits. */
  readonly endpoint?: string
  readonly minLength?: number
  readonly limit?: number
  /** Rows shown before any live request (the gallery's filled state). */
  readonly exampleQuery?: string
  readonly exampleResults?: readonly SiteSearchResult[]
}

/** A column of footer links. */
export interface FooterColumn {
  readonly heading: string
  readonly links: readonly ChromeLink[]
}

/** A social channel of the footer; the platform picks the glyph (a platform without one is not shown). */
export interface FooterSocial {
  readonly platform: string
  readonly href: string
  readonly label: string
}

/** A footer card of one of the site owner's other projects. */
export interface FooterProject {
  readonly name: string
  readonly eyebrow: string
  readonly description: string
  readonly href: string
  /** The accessible name of the card's link. */
  readonly linkLabel: string
  /** A project that is not open yet: no arrow, the "coming soon" label instead. */
  readonly isComingSoon: boolean
}
