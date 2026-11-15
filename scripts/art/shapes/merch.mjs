// Small merch: sticker sheet, enamel pins, membership card, gift boxes, price tag.
import { C } from '../palette.mjs'
import { at, circle, g, line, path, put, rect, shade } from '../svg.mjs'
import { bracket, cloud, globe, hexagon, lightning, nodes, shield, starburst } from './glyphs.mjs'

// ---------------------------------------------------------------- stickers
/** One die-cut sticker. The white border is a stroked twin drawn underneath. */
export const sticker = (kind, x, y, s) => {
  const badge = (fill, glyph) => circle(x, y, s * 0.5, fill, { stroke: C.white, strokeWidth: 6 }) + glyph
  switch (kind) {
    case 'cloud':
      return at(x, y, cloudBorder() + cloud({ x: 0, y: 0, size: 100, colour: C.orange }), s / 100)
    case 'shield':
      return at(x, y, shield({ x: 0, y: 0, size: 100, colour: C.white }) + shield({ x: 0, y: 0, size: 86, colour: C.charcoal, accent: C.orange }), s / 100)
    case 'bracket':
      return badge(C.orange, bracket({ x, y, size: s * 0.72, colour: C.white, sw: 10 }))
    case 'globe':
      return badge(C.charcoal, globe({ x, y, size: s * 0.88, colour: C.amber, dim: C.grey3 }))
    case 'lightning':
      return badge(C.amber, lightning({ x, y, size: s * 0.74, colour: C.ink }))
    case 'nodes':
      return at(x, y, rect(-52, -52, 104, 104, C.white, { rx: 26 }) + rect(-46, -46, 92, 92, C.ink, { rx: 22 }), s / 100) +
        nodes({ x, y, size: s * 0.8, colour: C.orange, lines: C.grey3, accent: C.amber })
    case 'starburst':
      return starburst({ x, y, size: s * 1.08, colour: C.white, points: 10, inner: 0.82 }) +
        starburst({ x, y, size: s * 0.96, colour: C.amber, points: 10, inner: 0.82 }) +
        circle(x, y, s * 0.2, C.orange)
    case 'hexagon':
      return hexagon({ x, y, size: s * 1.08, colour: C.white }) +
        hexagon({ x, y, size: s * 0.96, colour: C.orange }) +
        cloud({ x, y, size: s * 0.6, colour: C.white })
    case 'cloudDark':
      return at(x, y, cloudBorder() + cloud({ x: 0, y: 0, size: 100, colour: C.charcoal }), s / 100)
    case 'shieldOrange':
      return at(x, y, shield({ x: 0, y: 0, size: 100, colour: C.white }) + shield({ x: 0, y: 0, size: 86, colour: C.orange, accent: C.white }), s / 100)
    case 'pill':
      return at(x, y, rect(-52, -26, 104, 52, C.white, { rx: 26 }) + rect(-46, -20, 92, 40, C.ink, { rx: 20 }) + circle(-24, 0, 9, C.orange) + circle(0, 0, 9, C.amber) + circle(24, 0, 9, C.cream), s / 100 * 1.0)
    case 'dot':
      return badge(C.cream, cloud({ x, y, size: s * 0.66, colour: C.orange }))
    default:
      return ''
  }
}

// White rim for the cloud sticker: a slightly larger cloud silhouette in white.
const cloudBorder = () => cloud({ x: 0, y: 0, size: 116, colour: C.white })

export const STICKERS = { nominal: 250, center: [0, 0] }

export const stickerSheet = ({ cx, cy, size, rotate = 0, sheet = C.grey1 }) => {
  const kinds = ['cloud', 'shield', 'bracket', 'globe', 'lightning', 'nodes', 'starburst', 'hexagon', 'cloudDark', 'shieldOrange', 'pill', 'dot']
  const cols = [-68, 0, 68]
  const rows = [-87, -29, 29, 87]
  const items = kinds
    .map((kind, i) => sticker(kind, cols[i % 3], rows[Math.floor(i / 3)], 50))
    .join('')
  const parts = rect(-112, -122, 224, 244, shade(sheet, 0.12), { rx: 12, transform: 'translate(5 6)' }) + rect(-112, -122, 224, 244, sheet, { rx: 12 }) + items
  return put({ cx, cy, size, rotate }, STICKERS.nominal, parts, STICKERS.center)
}

// ---------------------------------------------------------------- pins
const pin = (kind, x, y, s) => {
  const rim = { stroke: C.amber, strokeWidth: 7, strokeLinejoin: 'round' }
  switch (kind) {
    case 'cloud':
      return at(x, y, cloud({ x: 0, y: 0, size: 100, colour: C.amber }) + cloud({ x: 0, y: 0, size: 88, colour: C.orange }), s / 100)
    case 'shield':
      return at(x, y, shield({ x: 0, y: 0, size: 100, colour: C.amber }) + shield({ x: 0, y: 0, size: 86, colour: C.charcoal, accent: C.orange }), s / 100)
    case 'bracket':
      return circle(x, y, s * 0.5, C.ink, { ...rim, strokeWidth: 6 }) + bracket({ x, y, size: s * 0.7, colour: C.orange, sw: 10 })
    case 'globe':
      return circle(x, y, s * 0.5, C.orange, { ...rim, strokeWidth: 6 }) + globe({ x, y, size: s * 0.88, colour: C.cream, dim: C.orangeDark })
    default:
      return ''
  }
}

export const PINCARD = { nominal: 230, center: [0, 0] }

export const pinCard = ({ cx, cy, size, rotate = 0, card = C.cream }) => {
  const parts =
    rect(-98, -112, 196, 224, shade(card, 0.14), { rx: 12, transform: 'translate(5 6)' }) +
    path('M-98,-100 Q-98,-112 -86,-112 L86,-112 Q98,-112 98,-100 L98,100 Q98,112 86,112 L-86,112 Q-98,112 -98,100 Z M0,-103 a6,6 0 1 0 0.01,0 Z', card, { fillRule: 'evenodd' }) +
    pin('cloud', -46, -48, 72) + pin('shield', 46, -48, 72) + pin('bracket', -46, 40, 66) + pin('globe', 46, 40, 66) +
    rect(-60, 86, 70, 7, C.grey2, { rx: 3.5 }) + rect(-60, 98, 44, 6, C.grey1, { rx: 3 }) + circle(66, 94, 8, C.orange)
  return put({ cx, cy, size, rotate }, PINCARD.nominal, parts, PINCARD.center)
}

export const BDAYPIN = { nominal: 220, center: [0, 0] }

export const birthdayPin = ({ cx, cy, size, rotate = 0, card = C.white }) => {
  const confetti = [[-60, -78, C.orange], [62, -64, C.amber], [-66, 70, C.amber], [58, 78, C.orange], [8, -90, C.charcoal]]
    .map(([x, y, col], i) => (i % 2 ? circle(x, y, 5, col) : rect(x - 5, y - 5, 10, 10, col, { rx: 2, transform: `rotate(${i * 20} ${x} ${y})` })))
    .join('')
  const parts =
    rect(-84, -104, 168, 208, shade(card, 0.12), { rx: 12, transform: 'translate(5 6)' }) +
    rect(-84, -104, 168, 208, card, { rx: 12 }) +
    confetti +
    starburst({ x: 0, y: -10, size: 140, colour: C.amber, points: 14, inner: 0.84 }) +
    starburst({ x: 0, y: -10, size: 124, colour: C.orange, points: 14, inner: 0.84 }) +
    circle(0, -10, 38, C.cream) +
    cloud({ x: 0, y: -10, size: 52, colour: C.orange }) +
    rect(-44, 70, 88, 7, C.grey2, { rx: 3.5 }) + rect(-28, 83, 56, 6, C.grey1, { rx: 3 })
  return put({ cx, cy, size, rotate }, BDAYPIN.nominal, parts, BDAYPIN.center)
}

// ---------------------------------------------------------------- membership card
export const CARD = { nominal: 210, center: [0, 0] }

export const membershipCard = ({ cx, cy, size, rotate = 0, card = C.charcoal }) => {
  const parts =
    rect(-100, -63, 200, 126, shade(card, 0.3), { rx: 14, transform: 'translate(6 7)' }) +
    rect(-100, -63, 200, 126, card, { rx: 14 }) +
    rect(-86, -46, 76, 58, C.orange, { rx: 12 }) +
    line(-86, -17, -10, -17, C.orangeDark, 2.5, { strokeLinecap: 'butt' }) +
    cloud({ x: -48, y: -17, size: 54, colour: C.cream }) +
    globe({ x: 66, y: -26, size: 44, colour: C.amber, dim: C.grey3 }) +
    rect(-86, 30, 90, 8, C.grey3, { rx: 4 }) +
    rect(-86, 45, 58, 7, C.grey3, { rx: 3.5 }) +
    circle(70, 44, 6, C.orange) + circle(86, 44, 6, C.amber)
  return put({ cx, cy, size, rotate }, CARD.nominal, parts, CARD.center)
}

// ---------------------------------------------------------------- gift boxes
/** Closed gift box with ribbon and bow; (x, y) is the centre of the bottom edge. */
export const giftBox = ({ x, y, w, h, colour, ribbon = C.cream, rotate = 0 }) => {
  const lidH = h * 0.24
  const bw = w * 0.16
  const body =
    rect(-w / 2, -h, w, h, colour, { rx: 6 }) +
    rect(-bw / 2, -h, bw, h, ribbon) +
    rect(-w / 2 - 6, -h - lidH * 0.4, w + 12, lidH, shade(colour, 0.12), { rx: 6 }) +
    rect(-bw / 2, -h - lidH * 0.4, bw, lidH, ribbon)
  const bowY = -h - lidH * 0.4
  const bow =
    path(`M0,${bowY} C${-w * 0.3},${bowY - h * 0.3} ${-w * 0.34},${bowY + 4} 0,${bowY} Z`, ribbon, { stroke: shade(ribbon, 0.16), strokeWidth: 2, strokeLinejoin: 'round' }) +
    path(`M0,${bowY} C${w * 0.3},${bowY - h * 0.3} ${w * 0.34},${bowY + 4} 0,${bowY} Z`, ribbon, { stroke: shade(ribbon, 0.16), strokeWidth: 2, strokeLinejoin: 'round' }) +
    circle(0, bowY, bw * 0.55, shade(ribbon, 0.1))
  return at(x, y, body + bow, 1, rotate)
}

/** Open gift box shell. `items` is drawn between the back wall and the front face so it appears to sit inside. */
export const openBox = ({ cx, cy, size, rotate = 0, colour = C.orange, ribbon = C.cream, items = '' }) => {
  const lidColour = shade(colour, 0.14)
  const lid = g(rect(-126, -11, 252, 22, lidColour, { rx: 6 }) + rect(-14, -11, 28, 22, ribbon), { transform: 'translate(-4 -84) rotate(-6)' })
  const parts =
    lid +
    rect(-120, -60, 240, 52, shade(colour, 0.38), { rx: 4 }) +
    items +
    rect(-120, -14, 240, 112, colour, { rx: 6 }) +
    rect(-14, -14, 28, 112, ribbon) +
    rect(-126, -24, 252, 22, lidColour, { rx: 6 }) +
    rect(-14, -24, 28, 22, ribbon)
  return put({ cx, cy, size, rotate }, 300, parts, [0, -30])
}

// ---------------------------------------------------------------- price tag
export const TAG = { nominal: 220, center: [0, 0] }

export const priceTag = ({ cx, cy, size, rotate = 0, colour = C.orange }) => {
  const outline = 'M-110,0 L-62,-52 Q-56,-58 -48,-58 L96,-58 Q108,-58 108,-46 L108,46 Q108,58 96,58 L-48,58 Q-56,58 -62,52 Z'
  const hole = 'M-70,0 a11,11 0 1 0 0.01,0 Z'
  const parts =
    path(outline, shade(colour, 0.28), { transform: 'translate(6 7)' }) +
    path(`${outline} ${hole}`, colour, { fillRule: 'evenodd', strokeLinejoin: 'round' }) +
    path('M-70,0 C-104,-4 -112,-50 -86,-56 C-62,-60 -52,-28 -70,0', 'none', { stroke: C.cream, strokeWidth: 5, strokeLinecap: 'round' }) +
    cloud({ x: 4, y: -4, size: 78, colour: C.cream }) +
    percent(64, 22, 30, C.cream)
  return put({ cx, cy, size, rotate }, TAG.nominal, parts, TAG.center)
}

/** A percent sign built from two rings and a slash. */
export const percent = (x, y, s, colour) =>
  at(
    x,
    y,
    circle(-12, -12, 8, 'none', { stroke: colour, strokeWidth: 5 }) +
      circle(12, 12, 8, 'none', { stroke: colour, strokeWidth: 5 }) +
      line(14, -16, -14, 16, colour, 5),
    s / 40,
  )

