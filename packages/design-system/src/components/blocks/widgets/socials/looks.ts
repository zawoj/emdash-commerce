import type { SocialChannelKey } from './variants'
import { socialChannelIcons } from '../../../../assets/social'
import type { SocialChannel } from '../../../parts/socials-widget/types'

interface ChannelLook {
  readonly icon: string
  readonly iconRight: number
  readonly iconTop: number
}

// Per-card icon geometry: the Facebook glyphs sit 1–2px above the row.
export const socialChannelLooks: Readonly<Record<SocialChannelKey, ChannelLook>> = {
  youtube: {
    icon: socialChannelIcons.youtube,
    iconRight: 12,
    iconTop: 12,
  },
  instagram: {
    icon: socialChannelIcons.instagram,
    iconRight: 12,
    iconTop: 12,
  },
  facebook: {
    icon: socialChannelIcons.facebook,
    iconRight: 12,
    iconTop: 11,
  },
  facebookGroup: {
    icon: socialChannelIcons.facebookGroup,
    iconRight: 12,
    iconTop: 10,
  },
}

export const cardOf = (channel: { key: SocialChannelKey; label: string; value: string; href: string }): SocialChannel => ({
  label: channel.label,
  value: channel.value,
  href: channel.href,
  ...socialChannelLooks[channel.key],
})
