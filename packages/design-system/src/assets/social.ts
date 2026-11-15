// Artwork of the socials widget, as opposed to its content
// (channel names, counts, copy, links) which comes in through props.
import facebookGroupIconUrl from './social/icon-facebook-group.svg?no-inline'
import facebookIconUrl from './social/icon-facebook.svg?no-inline'
import instagramIconUrl from './social/icon-instagram.svg?no-inline'
import youtubeIconUrl from './social/icon-youtube.svg?no-inline'

/** The 16px channel glyphs of the socials widget cards. */
export const socialChannelIcons = {
  youtube: youtubeIconUrl,
  instagram: instagramIconUrl,
  facebook: facebookIconUrl,
  facebookGroup: facebookGroupIconUrl,
} as const

