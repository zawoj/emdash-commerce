// The title row of "Popularne / polecane": `popular` carries the brand mark (Figma `default`),
// `recommended` the category's label and its partner credit (Figma `kategoria` / `kategoria-partner`).
export const popularPostsLooks = {
  popular: 'popular',
  recommended: 'recommended',
} as const
export type PopularPostsLook = (typeof popularPostsLooks)[keyof typeof popularPostsLooks]
