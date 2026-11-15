// Figma "tile-zawody" type feature: `fullWidth` = home-hero-fullwidth (931:28684) — the panel
// beside a dark band of 314px event cards; `article` = article-1 (931:28683) — the panel and one
// event card as two equal halves.
export const eventFeatureVariants = {
  fullWidth: 'full-width',
  article: 'article',
} as const
export type EventFeatureVariant = (typeof eventFeatureVariants)[keyof typeof eventFeatureVariants]
