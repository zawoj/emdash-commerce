// Variant vocabulary of the footer.

/** Figma "footer" component variants: `full` = withPartners (699:14616: sister-product cards,
 * four link columns, 618px) and `compact` = noPartners (661:3420: no cards, five link columns,
 * 426px). */
export const footerVariants = {
  full: 'full',
  compact: 'compact',
} as const
export type FooterVariant = (typeof footerVariants)[keyof typeof footerVariants]
