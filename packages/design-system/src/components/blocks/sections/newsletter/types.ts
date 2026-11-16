/** Figma home newsletter "section" (944:29612): the sign-up band; the form goes in the default slot. */
export interface NewsletterProps {
  readonly eyebrow?: string
  readonly heading: string
  /** Labels the band's section; unique per page. */
  readonly headingId?: string
  /** A line break in the copy is kept. */
  readonly body: string
}
