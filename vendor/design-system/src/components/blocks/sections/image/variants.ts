// How wide the `image` block sets its photo: `sm` ≈ 512px, `md` ≈ 768px, `lg` ≈ 1024px, `full` = the whole column.
export const imageBlockSizes = {
  sm: 'sm',
  md: 'md',
  lg: 'lg',
  full: 'full',
} as const
export type ImageBlockSize = (typeof imageBlockSizes)[keyof typeof imageBlockSizes]
