// Bundles and scenes: desk setup, welcome kit, hero, look-desk, spotlight, CTA and category tiles.
import { C } from './palette.mjs'
import { canvas, circle, line, rect, shadowEllipse, shade } from './svg.mjs'
import { cap, hoodie, jacket, tee } from './shapes/apparel.mjs'
import { bottle, mug, tumbler } from './shapes/drinkware.mjs'
import { cableKit, deskMat, keycaps, lamp } from './shapes/desk.mjs'
import { giftBox, membershipCard, openBox, percent, pinCard, priceTag, stickerSheet, sticker } from './shapes/merch.mjs'
import { bracket, cloud, globe, nodes, shield, starburst } from './shapes/glyphs.mjs'
import { LOOK_DESK, SPOTLIGHT } from './layouts.mjs'
import { H, W, disc, ground, shot } from './products.mjs'

// ---------------------------------------------------------------- bundles
const deskSetup = (bg, o) =>
  shot(
    bg,
    disc(o.disc, 470, 600, 780),
    ground(bg, o.mat.cy + 250, 400, o.mat.cx) +
      deskMat({ ...o.mat, size: 880 }) +
      lamp({ ...o.lamp, size: 640, arm: o.arm, base: o.base }) +
      cableKit({ ...o.cables, size: 420 }) +
      keycaps({ ...o.keys, size: 420 }),
  )

const welcomeKit = (bg, o) => {
  const items =
    bottle({ cx: 88, cy: -88, size: 180, colour: C.charcoal, capColour: C.orange, band: C.orange, decor: bracket({ x: 0, y: 8, size: 56, colour: C.orange }) }) +
    stickerSheet({ cx: -66, cy: -70, size: 120, rotate: -8 }) +
    pinCard({ cx: -4, cy: -80, size: 112, rotate: 5 }) +
    cap({ cx: 44, cy: -24, size: 105, colour: C.ink, brim: C.charcoal, rotate: 5 }) +
    mug({ cx: -72, cy: -22, size: 96, decor: shield({ x: 0, y: 4, size: 72, colour: C.orange, accent: C.white }) })
  return shot(bg, o.disc ? disc(o.disc, 450, 600, 760) : '', ground(bg, 1150, 400), openBox({ cx: 600, cy: 800, size: 1010, rotate: o.rotate, colour: o.box, ribbon: o.ribbon, items }))
}

// ---------------------------------------------------------------- scenes
const lookDesk = () => {
  const d = LOOK_DESK
  const wall = C.orangeTint
  const frame =
    rect(690, 190, 260, 330, shade(C.white, 0.14), { rx: 8 }) +
    rect(694, 194, 252, 322, C.white, { rx: 6 }) +
    rect(722, 222, 196, 266, C.charcoal, { rx: 4 }) +
    cloud({ x: 820, y: 355, size: 120, colour: C.orange })
  const wallGlobe = circle(1068, 470, 96, C.white) + globe({ x: 1068, y: 470, size: 150, colour: C.orange, dim: C.grey2 })
  const clock = circle(170, 300, 105, C.white) + circle(170, 300, 90, C.charcoal) + line(170, 300, 170, 238, C.cream, 8) + line(170, 300, 214, 322, C.orange, 8) + circle(170, 300, 9, C.amber)
  const desk =
    rect(0, d.deskTop, d.w, d.h - d.deskTop, C.grey1) +
    rect(0, d.deskTop, d.w, 18, C.grey2) +
    shadowEllipse(d.lamp.cx + 30, d.lamp.cy + 305, 190, 22, C.grey1, 0.14) +
    shadowEllipse(d.mug.cx, d.mug.cy + 124, 150, 16, C.grey1, 0.14)
  return canvas(
    d.w,
    d.h,
    wall,
    frame + wallGlobe + clock + desk +
      lamp({ ...d.lamp }) +
      deskMat({ ...d.mat }) +
      mug({ ...d.mug, decor: shield({ x: 0, y: 4, size: 70, colour: C.orange, accent: C.white, crack: C.white }) }) +
      cableKit({ ...d.cables }) +
      keycaps({ ...d.keycaps }),
  )
}

const spotlight = () => {
  const s = SPOTLIGHT
  return canvas(
    s.w,
    s.h,
    C.orange,
    circle(600, 700, 500, C.amber) +
      circle(600, 700, 500, C.amber) +
      shadowEllipse(600, 1230, 360, 38, C.orange, 0.2) +
      jacket({ ...s.jacket, colour: C.ink, accent: C.orange }),
  )
}

const hero = () => {
  const w = 1600
  const h = 1000
  const dots = [[640, 120, 10, C.amber], [700, 880, 8, C.orange], [560, 780, 6, C.grey3], [760, 200, 6, C.grey3], [1520, 880, 12, C.amber], [1500, 120, 8, C.orange]]
    .map(([x, y, r, col]) => circle(x, y, r, col))
    .join('')
  return canvas(
    w,
    h,
    C.charcoal,
    circle(1190, 500, 400, shade(C.charcoal, 0.08)) +
      globe({ x: 1190, y: 500, size: 760, colour: C.grey3, dim: shade(C.charcoal, 0.22) }) +
      nodes({ x: 1340, y: 230, size: 340, colour: C.amber, lines: C.grey3, accent: C.cream, lineWidth: 3 }) +
      cloud({ x: 1086, y: 566, size: 620, colour: C.orange, depth: C.orangeDark }) +
      cloud({ x: 880, y: 780, size: 170, colour: C.amber }) +
      cloud({ x: 1480, y: 760, size: 110, colour: C.cream }) +
      dots +
      rect(0, 940, 360, 8, C.orange),
  )
}

const cta = () => {
  const w = 1600
  const h = 900
  const bits = [[620, 150, 90], [760, 770, 70], [1500, 120, 80], [1520, 780, 110], [1080, 90, 60]]
    .map(([x, y, s], i) => cloud({ x, y, size: s, colour: i % 2 ? C.grey3 : shade(C.charcoal, 0.3) }))
    .join('')
  return canvas(
    w,
    h,
    C.charcoal,
    bits +
      nodes({ x: 1440, y: 690, size: 230, colour: C.orange, lines: C.grey3, accent: C.amber, lineWidth: 3 }) +
      nodes({ x: 700, y: 440, size: 200, colour: C.grey3, lines: shade(C.charcoal, 0.3), accent: C.orange, lineWidth: 2.5 }) +
      shadowEllipse(1040, 800, 330, 20, C.charcoal) +
      membershipCard({ cx: 1130, cy: 350, size: 560, rotate: 10, card: C.orange }) +
      membershipCard({ cx: 1030, cy: 500, size: 640, rotate: -8, card: C.ink }),
  )
}

// ---------------------------------------------------------------- category tiles (1000x1250)
const TW = 1000
const TH = 1250
const tile = (bg, ...layers) => canvas(TW, TH, bg, layers.join(''))

const giftBoxStack = () => {
  const bg = C.charcoal
  return tile(
    bg,
    shadowEllipse(500, 1010, 360, 34, bg) +
      giftBox({ x: 500, y: 1000, w: 560, h: 330, colour: C.orange, ribbon: C.cream }) +
      giftBox({ x: 470, y: 640, w: 420, h: 250, colour: C.cream, ribbon: C.orange, rotate: -4 }) +
      giftBox({ x: 540, y: 380, w: 300, h: 190, colour: C.amber, ribbon: C.ink, rotate: 5 }) +
      starburst({ x: 190, y: 250, size: 110, colour: C.orange, points: 10, inner: 0.8 }) +
      circle(820, 240, 16, C.amber) + circle(850, 330, 9, C.orange) + circle(160, 520, 12, C.grey3),
  )
}

const tiles = () => ({
  'cat-apparel.png': () =>
    tile(
      C.amberTint,
      disc(C.white, 400, 500, 640) +
        ground(C.amberTint, 1010, 380, 520) +
        hoodie({ cx: 610, cy: 640, size: 720, colour: C.charcoal, rotate: 6 }) +
        tee({ cx: 380, cy: 800, size: 540, colour: C.orange, rotate: -7 }),
    ),
  'cat-outerwear.png': () =>
    tile(C.cream, disc(C.grey1, 430, 500, 620), ground(C.cream, 1055, 300, 500), jacket({ cx: 500, cy: 620, size: 800, colour: C.ink, accent: C.orange })),
  'cat-desk.png': () =>
    tile(
      C.grey1,
      disc(C.white, 400, 500, 600) +
        ground(C.grey1, 880, 220, 330) +
        lamp({ cx: 360, cy: 560, size: 760 }) +
        shadowEllipse(560, 1130, 380, 26, C.grey1) +
        deskMat({ cx: 560, cy: 1000, size: 720, rotate: -8 }),
    ),
  'cat-drinkware.png': () =>
    tile(
      C.orangeTint,
      disc(C.amberTint, 440, 500, 640) +
        shadowEllipse(190, 1050, 130, 14, C.orangeTint) + shadowEllipse(830, 1050, 190, 16, C.orangeTint) + shadowEllipse(480, 1075, 220, 16, C.orangeTint) +
        bottle({ cx: 190, cy: 700, size: 720, decor: bracket({ x: 0, y: 8, size: 58, colour: C.ink }) }) +
        tumbler({ cx: 830, cy: 704, size: 700, decor: cloud({ x: 0, y: 10, size: 66, colour: C.cream }) }) +
        mug({ cx: 480, cy: 909, size: 380, decor: shield({ x: 0, y: 4, size: 72, colour: C.orange, accent: C.white, crack: C.white }) }),
    ),
  'cat-stickers.png': () =>
    tile(
      C.orange,
      shadowEllipse(500, 1130, 330, 26, C.orange) +
        stickerSheet({ cx: 410, cy: 620, size: 780, rotate: -7 }) +
        pinCard({ cx: 720, cy: 900, size: 400, rotate: 9 }) +
        sticker('lightning', 150, 1060, 150) + sticker('cloud', 190, 220, 170),
    ),
  'cat-bundles.png': giftBoxStack,
  'cat-new-arrivals.png': () =>
    tile(
      C.amber,
      starburst({ x: 520, y: 650, size: 820, colour: C.orangeDark, points: 16, inner: 0.84 }) +
        starburst({ x: 500, y: 630, size: 820, colour: C.orange, points: 16, inner: 0.84 }) +
        circle(500, 630, 320, C.cream) +
        tee({ cx: 500, cy: 640, size: 440, colour: C.charcoal, print: 'cloud' }) +
        circle(840, 1120, 14, C.orange) + circle(170, 1090, 20, C.cream) + circle(180, 200, 12, C.orange),
    ),
  'cat-sale.png': () =>
    tile(
      C.grey2,
      disc(C.grey1, 430, 500, 650) +
        priceTag({ cx: 500, cy: 650, size: 840, rotate: -14 }) +
        circle(820, 220, 22, C.orange) + circle(180, 1060, 16, C.charcoal) + percent(820, 1060, 90, C.orange),
    ),
})

export const sceneEntries = () => [
  { file: 'desk-setup-bundle.png', w: W, h: H, draw: () => deskSetup(C.amberTint, { disc: C.white, arm: C.charcoal, base: C.ink, mat: { cx: 600, cy: 990, rotate: -4 }, lamp: { cx: 300, cy: 520 }, cables: { cx: 880, cy: 520, rotate: 8 }, keys: { cx: 640, cy: 1345 } }) },
  { file: 'desk-setup-bundle-2.png', w: W, h: H, draw: () => deskSetup(C.charcoal, { disc: C.orange, arm: C.grey2, base: C.cream, mat: { cx: 600, cy: 960, rotate: 5, colour: C.ink }, lamp: { cx: 840, cy: 520 }, cables: { cx: 290, cy: 500, rotate: -10 }, keys: { cx: 560, cy: 1345 } }) },
  { file: 'welcome-kit.png', w: W, h: H, draw: () => welcomeKit(C.amberTint, { disc: C.white, box: C.orange, ribbon: C.cream, rotate: 0 }) },
  { file: 'welcome-kit-2.png', w: W, h: H, draw: () => welcomeKit(C.charcoal, { disc: C.orange, box: C.amber, ribbon: C.ink, rotate: -6 }) },
  { file: 'hero.png', w: 1600, h: 1000, draw: hero },
  { file: 'look-desk.png', w: LOOK_DESK.w, h: LOOK_DESK.h, draw: lookDesk },
  { file: 'spotlight-jacket.png', w: SPOTLIGHT.w, h: SPOTLIGHT.h, draw: spotlight },
  { file: 'cta.png', w: 1600, h: 900, draw: cta },
  ...Object.entries(tiles()).map(([file, draw]) => ({ file, w: TW, h: TH, draw })),
]

