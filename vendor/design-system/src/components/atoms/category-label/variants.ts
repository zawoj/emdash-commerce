// Color axis — the category-* palette (eight neutral tones; a CMS colour overrides it),
// shared by every atom that tags content with a category (CategoryLabel, CategoryPartnerBadge).
export const categoryKeys = {
  tone1: 'tone-1',
  tone2: 'tone-2',
  tone3: 'tone-3',
  tone4: 'tone-4',
  tone5: 'tone-5',
  tone6: 'tone-6',
  tone7: 'tone-7',
  tone8: 'tone-8',
} as const
export type CategoryKey = (typeof categoryKeys)[keyof typeof categoryKeys]

// Size axis — Figma category-label-small (`s`, 20px) and category-label-large (`l`, 30px).
export const categoryLabelSizes = {
  s: 's',
  l: 'l',
} as const
export type CategoryLabelSize = (typeof categoryLabelSizes)[keyof typeof categoryLabelSizes]
