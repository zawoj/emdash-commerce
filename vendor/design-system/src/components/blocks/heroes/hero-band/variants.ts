// Look axes of the hero band. Each is an `as const` object plus its union.

// The band itself (Figma 944:39843 / 1023:58302) or the centred title over the intro (1017:40793).
export const heroBandVariants = {
  band: 'band',
  centered: 'centered',
} as const
export type HeroBandVariant = (typeof heroBandVariants)[keyof typeof heroBandVariants]

// Weight of the description: text-regular-lg (944:39841) or text-medium-lg (1023:67055, 1023:58300).
export const heroBandDescriptionWeights = {
  regular: 'regular',
  medium: 'medium',
} as const
export type HeroBandDescriptionWeight = (typeof heroBandDescriptionWeights)[keyof typeof heroBandDescriptionWeights]
