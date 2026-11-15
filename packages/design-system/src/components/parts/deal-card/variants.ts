// Figma "card-deal" layout: `grid` = Default (706:26776; home, lista-znizek) — framed photo,
// 24px title, full-width CTA; `detail` = the in-article deal card (article 944:33120) — unframed,
// larger photo crop, 36px title, the how-to block and a code field beside the CTA.
export const dealCardVariants = {
  grid: 'grid',
  detail: 'detail',
} as const
export type DealCardVariant = (typeof dealCardVariants)[keyof typeof dealCardVariants]

// Figma's brand mark over the deal photo is 48px tall (home 944:29580, its width follows the
// brand's proportions). The data layer sizes a partner logo to it.
export const DEAL_MARK_HEIGHT = 48
