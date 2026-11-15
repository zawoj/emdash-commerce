// The channels the socials widget has a card for, in grid order.
export const socialChannelKeys = {
  youtube: 'youtube',
  instagram: 'instagram',
  facebook: 'facebook',
  facebookGroup: 'facebookGroup',
} as const
export type SocialChannelKey = (typeof socialChannelKeys)[keyof typeof socialChannelKeys]

export const socialChannelOrder: readonly SocialChannelKey[] = [
  socialChannelKeys.youtube,
  socialChannelKeys.instagram,
  socialChannelKeys.facebook,
  socialChannelKeys.facebookGroup,
]
