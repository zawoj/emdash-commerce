// Desk gear: mat with keyboard and mouse, articulated lamp, cable kit, keycaps.
import { C } from '../palette.mjs'
import { at, circle, g, line, mix, path, put, rect, shade } from '../svg.mjs'
import { cloud } from './glyphs.mjs'

export const MAT = { nominal: 300, center: [0, 0] }

export const keyboard = ({ x, y, w = 130, h = 46, body = C.cream, keys = C.grey2 }) => {
  const cols = 12
  const rows = 3
  const pad = 5
  const kw = (w - pad * 2 - (cols - 1) * 2) / cols
  const kh = (h - pad * 2 - (rows - 1) * 2) / rows
  let out = rect(x - w / 2, y - h / 2, w, h, body, { rx: 5 })
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      out += rect(x - w / 2 + pad + c * (kw + 2), y - h / 2 + pad + r * (kh + 2), kw, kh, keys, { rx: 1.5 })
    }
  }
  return out
}

export const mouse = ({ x, y, w = 26, h = 42, body = C.cream }) =>
  rect(x - w / 2, y - h / 2, w, h, body, { rx: w / 2 }) +
  line(x - w / 2 + 1, y - h / 6, x + w / 2 - 1, y - h / 6, C.grey2, 2, { strokeLinecap: 'butt' }) +
  line(x, y - h / 2 + 2, x, y - h / 6, C.grey2, 2, { strokeLinecap: 'butt' }) +
  rect(x - 2, y - h / 3.2, 4, 8, C.orange, { rx: 2 })

export const deskMat = ({ cx, cy, size, rotate = 0, colour = C.charcoal, withGear = true }) => {
  const stitch = rect(-141, -66, 282, 132, 'none', { rx: 9, stroke: C.orange, strokeWidth: 2.5, strokeDasharray: '7 5' })
  const parts =
    rect(-150, -75, 300, 150, colour, { rx: 14 }) +
    stitch +
    (withGear
      ? cloud({ x: -108, y: -38, size: 34, colour: C.orange }) + keyboard({ x: -14, y: 10 }) + mouse({ x: 96, y: 14 })
      : cloud({ x: 0, y: 0, size: 70, colour: C.orange }))
  return put({ cx, cy, size, rotate }, MAT.nominal, parts, MAT.center)
}

export const LAMP = { nominal: 250, center: [18, 0] }

export const lamp = ({ cx, cy, size, rotate = 0, glow = true, arm = C.charcoal, base: baseColour = C.ink }) => {
  const glowShape = glow ? circle(62, 8, 78, C.amberTint) + circle(62, 8, 48, C.amber) : ''
  const arms =
    line(0, 100, -40, 10, arm, 9) + line(-40, 10, 36, -62, arm, 9)
  const base = rect(-46, 106, 92, 14, baseColour, { rx: 7 }) + rect(-30, 96, 60, 12, arm, { rx: 6 })
  const joints = circle(-40, 10, 11, C.orange) + circle(-40, 10, 4, C.orangeDark) + circle(36, -62, 10, C.orange)
  const head = g(
    path('M-14,-8 L14,-8 L36,36 L-36,36 Z', C.orange, { strokeLinejoin: 'round' }) +
      rect(-38, 33, 76, 8, C.orangeDark, { rx: 4 }) +
      circle(0, 44, 11, C.amberTint),
    { transform: 'translate(36 -62) rotate(-20)' },
  )
  return put({ cx, cy, size, rotate }, LAMP.nominal, glowShape + base + arms + joints + head, LAMP.center)
}

export const CABLES = { nominal: 230, center: [0, 0] }

const ring = (x, y, s, colour, rot = 0) =>
  at(
    x,
    y,
    path(
      `M${-s / 2},${-s / 2 + 9} Q${-s / 2},${-s / 2} ${-s / 2 + 9},${-s / 2} L${s / 2 - 9},${-s / 2} Q${s / 2},${-s / 2} ${s / 2},${-s / 2 + 9} L${s / 2},${s / 2 - 9} Q${s / 2},${s / 2} ${s / 2 - 9},${s / 2} L${-s / 2 + 9},${s / 2} Q${-s / 2},${s / 2} ${-s / 2},${s / 2 - 9} Z M0,-9 A9,9 0 1 0 0.01,-9 Z`,
      colour,
      { fillRule: 'evenodd' },
    ) + rect(-3, -s / 2 - 1, 6, 12, shade(colour, 0.25)),
    1,
    rot,
  )

export const cableKit = ({ cx, cy, size, rotate = 0 }) => {
  const tie = (colour) => rect(0, -3.5, 112, 7, colour, { rx: 3.5 }) + rect(-8, -8, 20, 16, colour, { rx: 4 }) + rect(-2, -3, 8, 6, shade(colour, 0.3), { rx: 2 })
  const ties = [[-72, C.ink], [-54, C.orange], [-36, C.charcoal], [-18, C.orange], [0, C.ink]]
    .map(([a, col]) => at(-80, 40, tie(col), 1, a))
    .join('')
  const strap = (colour, w) =>
    rect(-w / 2, -11, w, 22, colour, { rx: 11 }) +
    rect(w / 2 - 44, -11, 44, 22, mix(colour, C.white, colour === C.orange ? 0.3 : 0.12), { rx: 11 }) +
    [0, 1, 2, 3].map((i) => line(w / 2 - 36 + i * 9, -6, w / 2 - 36 + i * 9, 6, shade(colour, 0.3), 2, { strokeLinecap: 'butt' })).join('')
  const straps = at(30, 80, strap(C.orange, 140), 1, -5) + at(14, 108, strap(C.charcoal, 140), 1, 4)
  const clips = ring(78, -34, 40, C.amber, 8) + ring(98, 12, 38, C.charcoal, -10) + ring(60, 36, 34, C.orange, 20)
  return put({ cx, cy, size, rotate }, CABLES.nominal, ties + straps + clips, CABLES.center)
}

export const KEYCAPS = { nominal: 214, center: [0, 0] }

const keycap = (x, y, w, h, colour, glyph = '') => {
  const base = shade(colour, 0.28)
  return (
    rect(x, y + 4, w, h - 4, base, { rx: 10 }) +
    rect(x + 3, y, w - 6, h - 12, colour, { rx: 8 }) +
    rect(x + 11, y + 7, w - 22, h - 28, shade(colour, 0.08), { rx: 6 }) +
    glyph
  )
}

export const keycaps = ({ cx, cy, size, rotate = 0 }) => {
  const parts =
    keycap(-104, -58, 82, 56, C.orange, cloud({ x: -63, y: -33, size: 30, colour: C.cream })) +
    keycap(-14, -58, 54, 56, C.charcoal) +
    keycap(48, -58, 54, 56, C.cream) +
    keycap(-104, 6, 54, 56, C.charcoal) +
    keycap(-42, 6, 54, 56, C.orange) +
    keycap(20, 6, 84, 56, C.charcoal)
  return put({ cx, cy, size, rotate }, KEYCAPS.nominal, parts, KEYCAPS.center)
}
