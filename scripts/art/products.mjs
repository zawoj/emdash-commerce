// Product shots: 1200x1500 (4:5) studio compositions on a flat tinted backdrop.
import { C } from './palette.mjs'
import { canvas, circle, shadowEllipse, at } from './svg.mjs'
import { cap, hoodie, jacket, socks, tee, printFor } from './shapes/apparel.mjs'
import { bottle, mug, tumbler } from './shapes/drinkware.mjs'
import { cableKit, deskMat, keycaps, lamp } from './shapes/desk.mjs'
import { birthdayPin, membershipCard, pinCard, stickerSheet, sticker } from './shapes/merch.mjs'
import { bracket, cloud, shield } from './shapes/glyphs.mjs'

export const W = 1200
export const H = 1500

export const shot = (bg, ...layers) => canvas(W, H, bg, layers.join(''))
export const disc = (colour, r = 440, cx = 600, cy = 720) => circle(cx, cy, r, colour)
export const ground = (bg, y, rx = 330, cx = 600) => shadowEllipse(cx, y, rx, rx * 0.11, bg)

/** A round detail callout: a flat ring with a magnified glyph in it. */
const callout = (cx, cy, r, ring, fill, glyph) => circle(cx, cy, r, ring) + circle(cx, cy, r - 14, fill) + glyph

// ---------------------------------------------------------------- variant products
const colourSlug = { [C.orange]: 'orange', [C.amber]: 'amber', [C.ink]: 'black', [C.white]: 'white', [C.charcoal]: 'charcoal' }

const variants = (slug, colours, drawMain, drawSecond) =>
  colours.flatMap((colour, i) => [
    { file: i === 0 ? `${slug}.png` : `${slug}-${colourSlug[colour]}.png`, w: W, h: H, draw: () => drawMain(colour) },
    ...(i === 0 ? [{ file: `${slug}-2.png`, w: W, h: H, draw: () => drawSecond(colour) }] : []),
  ])

const teeProduct = (slug, colours, print, bg, bg2) => {
  const glyph = (colour) => {
    const p = printFor(colour)
    return print === 'shield' ? shield({ x: 0, y: 0, size: 150, colour: p.main, accent: colour }) : cloud({ x: 0, y: 0, size: 150, colour: p.main })
  }
  return variants(
    slug,
    colours,
    (colour) => shot(bg, ground(bg, 1150), tee({ cx: 600, cy: 730, size: 820, colour, print })),
    (colour) =>
      shot(
        bg2,
        ground(bg2, 1190, 340, 580),
        tee({ cx: 560, cy: 690, size: 840, colour, print, rotate: -11 }),
        callout(950, 1180, 150, C.white, bg2 === C.charcoal ? C.orange : C.charcoal, at(950, 1180, glyph(bg2 === C.charcoal ? C.orange : C.charcoal))),
      ),
  )
}

const hoodieProduct = () => {
  const bg = C.grey1
  const bg2 = C.orangeTint
  return variants(
    'edge-hoodie',
    [C.charcoal, C.orange],
    (colour) => shot(bg, ground(bg, 1185, 340), hoodie({ cx: 600, cy: 730, size: 900, colour })),
    (colour) =>
      shot(
        bg2,
        ground(bg2, 1235, 380, 580),
        hoodie({ cx: 580, cy: 690, size: 900, colour, rotate: 9 }),
        callout(230, 1200, 130, C.white, C.charcoal, cloud({ x: 230, y: 1200, size: 130, colour: C.orange })),
      ),
  )
}

const jacketProduct = () => {
  const bg = C.cream
  const bg2 = C.grey1
  const accentFor = (colour) => (colour === C.orange ? C.ink : C.orange)
  return variants(
    'packet-jacket',
    [C.ink, C.orange],
    (colour) => shot(bg, ground(bg, 1190, 350), jacket({ cx: 600, cy: 720, size: 940, colour, accent: accentFor(colour) })),
    (colour) =>
      shot(
        bg2,
        ground(bg2, 1240, 380, 600),
        jacket({ cx: 620, cy: 700, size: 940, colour, accent: accentFor(colour), rotate: -8 }),
        callout(230, 1200, 130, C.white, C.orange, cloud({ x: 230, y: 1200, size: 120, colour: C.ink })),
      ),
  )
}

const bundleProduct = () => {
  const bg = C.amberTint
  const bg2 = C.orange
  const kit = (teeColour, capColour, o) =>
    ground(o.bg, o.teeFoot, 300, o.teeX) +
    tee({ cx: o.teeX, cy: o.teeY, size: 700, colour: teeColour, rotate: o.teeR }) +
    ground(o.bg, 1400, 190, o.capX) +
    cap({ cx: o.capX, cy: o.capY, size: 520, colour: capColour, brim: capColour === C.orange ? C.orangeDark : C.charcoal, rotate: o.capR }) +
    ground(o.bg, 1415, 200, o.sockX) +
    socks({ cx: o.sockX, cy: o.sockY, size: 500, rotate: o.sockR })
  const first = { bg, teeX: 580, teeY: 560, teeFoot: 925, teeR: -6, capX: 880, capY: 1250, capR: 6, sockX: 330, sockY: 1190, sockR: -6 }
  const second = { bg: bg2, teeX: 620, teeY: 560, teeFoot: 925, teeR: 8, capX: 320, capY: 1250, capR: -8, sockX: 850, sockY: 1190, sockR: 6 }
  return variants(
    'workers-fit-bundle',
    [C.ink, C.orange],
    (colour) => shot(bg, kit(colour, colour === C.ink ? C.orange : C.ink, first)),
    (colour) => shot(bg2, kit(colour, colour === C.ink ? C.white : C.ink, second)),
  )
}

// ---------------------------------------------------------------- simple products
const simple = (slug, first, second) => [
  { file: `${slug}.png`, w: W, h: H, draw: first },
  { file: `${slug}-2.png`, w: W, h: H, draw: second },
]

const crackedShield = (size = 74, y = 4) => shield({ x: 0, y, size, colour: C.orange, accent: C.white, crack: C.white })

const simpleProducts = () => [
  ...simple(
    'ray-id-cap',
    () => shot(C.amberTint, disc(C.white), ground(C.amberTint, 960, 330), cap({ cx: 600, cy: 720, size: 900, colour: C.charcoal, brim: C.orange })),
    () => shot(C.orange, disc(C.orangeDark, 470), ground(C.orange, 990, 340), cap({ cx: 600, cy: 740, size: 900, colour: C.ink, brim: C.charcoal, rotate: -9 })),
  ),
  ...simple(
    'dns-socks',
    () => shot(C.grey1, disc(C.white), ground(C.grey1, 1110, 330), socks({ cx: 600, cy: 720, size: 860 })),
    () => shot(C.amberTint, disc(C.orangeTint, 460), ground(C.amberTint, 1190, 340), socks({ cx: 600, cy: 740, size: 840, rotate: -16 })),
  ),
  ...simple(
    'ddos-mug',
    () => shot(C.orange, disc(C.orangeDark, 470), ground(C.orange, 1090, 330), mug({ cx: 600, cy: 760, size: 800, decor: crackedShield() })),
    () => shot(C.orangeTint, disc(C.white, 440), ground(C.orangeTint, 1090, 330), mug({ cx: 600, cy: 760, size: 800, colour: C.charcoal, decor: shield({ x: 0, y: 4, size: 74, colour: C.orange, accent: C.charcoal, crack: C.charcoal }), rotate: 0 })),
  ),
  ...simple(
    'workers-bottle',
    () =>
      shot(
        C.amberTint,
        disc(C.white, 400),
        ground(C.amberTint, 1255, 230),
        bottle({ cx: 600, cy: 750, size: 1000, decor: bracket({ x: 0, y: 8, size: 58, colour: C.ink }) }),
      ),
    () =>
      shot(
        C.charcoal,
        disc(C.ink, 460),
        bottle({ cx: 600, cy: 740, size: 980, colour: C.orange, capColour: C.ink, band: C.amber, decor: bracket({ x: 0, y: 8, size: 58, colour: C.white }), rotate: -32 }),
      ),
  ),
  ...simple(
    'orange-tumbler',
    () => shot(C.grey1, disc(C.white, 400), ground(C.grey1, 1260, 220), tumbler({ cx: 600, cy: 750, size: 1000, decor: cloud({ x: 0, y: 10, size: 66, colour: C.cream }) })),
    () => shot(C.charcoal, disc(C.orange, 420), ground(C.charcoal, 1260, 230), tumbler({ cx: 600, cy: 750, size: 1000, colour: C.ink, lid: C.cream, straw: C.amber, decor: cloud({ x: 0, y: 10, size: 66, colour: C.orange }) })),
  ),
  ...simple(
    'sticker-pack',
    () => shot(C.orange, ground(C.orange, 1250, 330), stickerSheet({ cx: 600, cy: 740, size: 900 })),
    () =>
      shot(
        C.charcoal,
        stickerSheet({ cx: 600, cy: 700, size: 820, rotate: 7 }) +
          sticker('cloud', 190, 1230, 200) + sticker('shield', 1010, 1210, 190) + sticker('lightning', 1020, 260, 150) + sticker('hexagon', 170, 250, 160),
      ),
  ),
  ...simple(
    'pin-set',
    () => shot(C.grey1, ground(C.grey1, 1260, 330), pinCard({ cx: 600, cy: 740, size: 940 })),
    () => shot(C.orange, ground(C.orange, 1260, 330), pinCard({ cx: 600, cy: 740, size: 920, rotate: -8, card: C.white })),
  ),
  ...simple(
    'birthday-pin',
    () => shot(C.amberTint, ground(C.amberTint, 1255, 320), birthdayPin({ cx: 600, cy: 740, size: 940 })),
    () => shot(C.charcoal, ground(C.charcoal, 1255, 320), birthdayPin({ cx: 600, cy: 740, size: 920, rotate: -7, card: C.cream })),
  ),
  ...simple(
    'desk-mat',
    () => shot(C.grey1, disc(C.white, 470), ground(C.grey1, 1010, 420), deskMat({ cx: 600, cy: 720, size: 960, rotate: -14 })),
    () => shot(C.orangeTint, disc(C.amberTint, 470), ground(C.orangeTint, 1010, 420), deskMat({ cx: 600, cy: 720, size: 960, rotate: 12, colour: C.ink })),
  ),
  ...simple(
    'desk-lamp',
    () => shot(C.cream, ground(C.cream, 1262, 260, 640), lamp({ cx: 600, cy: 780, size: 1000 })),
    () => shot(C.charcoal, ground(C.charcoal, 1262, 260, 640), lamp({ cx: 600, cy: 780, size: 1000, arm: C.grey2, base: C.cream })),
  ),
  ...simple(
    'cable-kit',
    () => shot(C.grey1, disc(C.white, 450), cableKit({ cx: 600, cy: 740, size: 960 })),
    () => shot(C.charcoal, disc(C.white, 450), cableKit({ cx: 600, cy: 740, size: 960, rotate: -14 })),
  ),
  ...simple(
    'keycaps',
    () => shot(C.orangeTint, disc(C.white, 440), ground(C.orangeTint, 1010, 380), keycaps({ cx: 600, cy: 720, size: 920 })),
    () => shot(C.orange, disc(C.orangeDark, 450), ground(C.orange, 1010, 380), keycaps({ cx: 600, cy: 720, size: 900, rotate: -10 })),
  ),
  ...simple(
    'edge-club',
    () => shot(C.orange, disc(C.orangeDark, 460), ground(C.orange, 1050, 400), membershipCard({ cx: 600, cy: 720, size: 920, rotate: -12 })),
    () =>
      shot(
        C.amberTint,
        disc(C.white, 450),
        membershipCard({ cx: 560, cy: 640, size: 860, rotate: 10, card: C.orange }) + membershipCard({ cx: 640, cy: 880, size: 860, rotate: -8 }),
      ),
  ),
]

export const productEntries = () => [
  ...teeProduct('workers-tee', [C.orange, C.amber, C.ink, C.white], 'cloud', C.orangeTint, C.charcoal),
  ...teeProduct('zero-trust-tee', [C.ink, C.white], 'shield', C.amberTint, C.orange),
  ...hoodieProduct(),
  ...jacketProduct(),
  ...bundleProduct(),
  ...simpleProducts(),
]
