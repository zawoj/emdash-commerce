// How wide a `PageContent` sets its text column: `sm` ≈ 560px, `md` ≈ 720px, `lg` ≈ 960px.
export const pageContentWidths = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
} as const
export type PageContentWidth = (typeof pageContentWidths)[keyof typeof pageContentWidths]
