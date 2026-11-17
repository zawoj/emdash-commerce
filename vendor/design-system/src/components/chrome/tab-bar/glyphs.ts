// The tab bar's own glyphs (24px box, outline): `shapes` are filled with the ink while the tab is
// current (the "solid" icon), `details` are inner lines drawn in the surface colour on top of that fill,
// `lines` never fill (the magnifier gets a heavier stroke instead).
import { tabBarIcons, type TabBarIcon } from './variants'

export interface TabGlyph {
  readonly shapes: readonly string[]
  readonly details: readonly string[]
  readonly lines: readonly string[]
}

export const tabGlyphs: Record<TabBarIcon, TabGlyph> = {
  [tabBarIcons.home]: {
    shapes: ['M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z'],
    details: ['M9.5 21v-6h5v6'],
    lines: [],
  },
  [tabBarIcons.categories]: {
    shapes: ['M4 4h6.5v6.5H4Z', 'M13.5 4H20v6.5h-6.5Z', 'M4 13.5h6.5V20H4Z', 'M13.5 13.5H20V20h-6.5Z'],
    details: [],
    lines: [],
  },
  [tabBarIcons.search]: {
    shapes: [],
    details: [],
    lines: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Z', 'm20.5 20.5-4.6-4.6'],
  },
  [tabBarIcons.cart]: {
    shapes: ['M6 2.5 3 6.5V20a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 20V6.5l-3-4Z'],
    details: ['M3 6.5h18', 'M16 10.5a4 4 0 0 1-8 0'],
    lines: [],
  },
  [tabBarIcons.account]: {
    shapes: ['M12 3a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Z', 'M4.5 21v-1a6 6 0 0 1 6-6h3a6 6 0 0 1 6 6v1Z'],
    details: [],
    lines: [],
  },
}
