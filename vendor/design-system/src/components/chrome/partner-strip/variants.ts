// Variant vocabulary of the partner strip.

/** Where a partner strip sits: under the header (42px band, 48px gaps) or above the footer
 * (50px band, 32px gaps). */
export const partnerStripPlacements = {
  header: 'header',
  footer: 'footer',
} as const
export type PartnerStripPlacement = (typeof partnerStripPlacements)[keyof typeof partnerStripPlacements]
