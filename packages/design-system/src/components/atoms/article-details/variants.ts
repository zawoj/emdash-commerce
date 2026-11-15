// Figma article-details "Variant": author gray/700 + date gray/500 on light backgrounds, author
// gray/100 + date gray/200 on dark ones.
export const articleDetailsVariants = {
  onLight: 'on-light',
  onDark: 'on-dark',
} as const
export type ArticleDetailsVariant = (typeof articleDetailsVariants)[keyof typeof articleDetailsVariants]
