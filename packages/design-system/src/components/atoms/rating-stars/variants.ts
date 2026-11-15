export const ratingStarsSizes = { sm: 'sm', md: 'md', lg: 'lg' } as const
export type RatingStarsSize = (typeof ratingStarsSizes)[keyof typeof ratingStarsSizes]

/** Stars drawn; the scale of the stored ratings. */
export const RATING_STARS_MAX = 5
