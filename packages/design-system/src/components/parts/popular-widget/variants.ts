// Row spacing of the "tile-popularne-widget-R" list: Figma draws one row tighter than the others
// (8px copy↔label, 4px title↔date instead of 24px / 8px), which changes where its title wraps.
export const popularRowSpacings = {
  regular: 'regular',
  tight: 'tight',
} as const
export type PopularRowSpacing = (typeof popularRowSpacings)[keyof typeof popularRowSpacings]

// "tile-popularne-widget-R" frame: `tile` = 12px-radius tile, 32/24 title padding, hairlines
// between rows (Figma 931:29570, every view); `compact` = "X_old_widget-R-czytane" (771:24348;
// partner / Sylwetki listings) — 8px radius, 20px padding, rows separated by 12px + a 1px
// bottom border, dates in text-secondary.
export const popularWidgetLayouts = {
  tile: 'tile',
  compact: 'compact',
} as const
export type PopularWidgetLayout = (typeof popularWidgetLayouts)[keyof typeof popularWidgetLayouts]
