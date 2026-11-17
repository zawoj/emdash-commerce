import type { LinkContent } from '../../../../types/link'

/** Figma kontakt "tile" (1021:51699): the editorial contact tile. Every part is optional. */
export interface ContactDetailsProps {
  /** Names the tile's section for assistive technology. */
  readonly label: string
  readonly emailLabel: string
  readonly email?: string
  readonly socialsLabel: string
  /** The social profiles, each a name linking to the profile. */
  readonly socials: readonly LinkContent[]
  readonly publisherLabel: string
  readonly publisherName?: string
  readonly publisherAddress?: string
}
