// Garments in flat vector: tee, hoodie, jacket, cap, socks.
import { C } from '../palette.mjs'
import { at, circle, g, line, lum, mirror, path, put, rect, shade, mix, toWorld } from '../svg.mjs'
import { cloud, shield } from './glyphs.mjs'

/** Print colours that read on a garment colour. */
export const printFor = (garment) => {
  if (garment === C.orange) return { main: C.white, accent: C.ink }
  if (garment === C.amber) return { main: C.ink, accent: C.white }
  if (lum(garment) < 0.4) return { main: C.orange, accent: C.cream }
  return { main: C.orange, accent: C.charcoal }
}

const interior = (c) => (lum(c) < 0.2 ? c : mix(c, C.ink, 0.45))
const stringColour = (c) => (lum(c) > 0.7 ? C.grey2 : C.cream)

// ---------------------------------------------------------------- tee
export const TEE = { nominal: 212, center: [0, 4] }

/** `print` is 'cloud' | 'shield' | 'none'. */
export const tee = ({ cx, cy, size, colour, print = 'cloud', rotate = 0, flip = false }) => {
  const p = printFor(colour)
  const edge = shade(colour, 0.16)
  const body =
    'M-32,-98 L-64,-90 L-100,-58 L-80,-24 L-58,-38 L-58,102 Q-58,106 -54,106 L54,106 Q58,106 58,102 L58,-38 L80,-24 L100,-58 L64,-90 L32,-98 Q0,-64 -32,-98 Z'
  const parts =
    path(body, colour, { strokeLinejoin: 'round' }) +
    path('M-32,-98 Q0,-64 32,-98 Q0,-90 -32,-98 Z', mix(colour, lum(colour) > 0.4 ? C.ink : C.white, 0.22)) +
    path('M-32,-98 Q0,-64 32,-98', 'none', { stroke: edge, strokeWidth: 6, strokeLinecap: 'round' }) +
    line(-64, -90, -58, -38, edge, 2.5) +
    line(64, -90, 58, -38, edge, 2.5) +
    line(-94, -61, -74, -27, edge, 2.5) +
    line(94, -61, 74, -27, edge, 2.5) +
    line(-57, 95, 57, 95, edge, 2.5) +
    (print === 'cloud' ? cloud({ x: 0, y: -22, size: 66, colour: p.main }) : '') +
    (print === 'shield' ? shield({ x: 0, y: -20, size: 70, colour: p.main, accent: colour }) : '')
  return put({ cx, cy, size, rotate, flip }, TEE.nominal, parts, TEE.center)
}

// ---------------------------------------------------------------- hoodie
export const HOODIE = { nominal: 272, center: [0, -24] }

export const hoodie = ({ cx, cy, size, colour, rotate = 0 }) => {
  const p = printFor(colour)
  const edge = shade(colour, 0.18)
  const rib = shade(colour, 0.12)
  const sleeve = mirror2(
    path('M-58,-72 L-96,-62 L-122,48 L-120,96 L-90,100 L-84,46 L-62,-10 Z', colour, { strokeLinejoin: 'round' }) +
      path('M-121,80 L-87,84 L-90,100 L-120,96 Z', rib) +
      line(-96, -58, -84, 44, edge, 2.5),
  )
  const body =
    path('M-62,-78 L62,-78 L66,100 Q66,108 58,108 L-58,108 Q-66,108 -66,100 Z', colour) +
    path('M-66,92 L66,92 L66,100 Q66,108 58,108 L-58,108 Q-66,108 -66,100 Z', rib)
  const hood =
    path('M-60,-66 C-72,-128 -40,-160 0,-160 C40,-160 72,-128 60,-66 Q0,-34 -60,-66 Z', colour, { stroke: edge, strokeWidth: 3 }) +
    path('M0,-148 C-30,-148 -34,-120 -32,-100 C-30,-76 -14,-64 0,-64 C14,-64 30,-76 32,-100 C34,-120 30,-148 0,-148 Z', interior(colour), {
      stroke: edge,
      strokeWidth: 4,
    })
  const sc = stringColour(colour)
  const strings =
    line(-13, -54, -15, -4, sc, 4) + line(13, -54, 16, 0, sc, 4) + circle(-15, -2, 4.5, sc) + circle(16, 2, 4.5, sc) +
    circle(-13, -56, 3.5, C.ink) + circle(13, -56, 3.5, C.ink)
  const pocket =
    path('M-46,28 L46,28 L56,86 L-56,86 Z', shade(colour, 0.07), { stroke: edge, strokeWidth: 2.5, strokeLinejoin: 'round' }) +
    line(-47, 36, -56, 58, edge, 2.5) +
    line(47, 36, 56, 58, edge, 2.5)
  const parts = sleeve + body + pocket + hood + strings + cloud({ x: 38, y: -24, size: 32, colour: p.main })
  return put({ cx, cy, size, rotate }, HOODIE.nominal, parts, HOODIE.center)
}

const mirror2 = (inner) => inner + mirror(inner)

// ---------------------------------------------------------------- jacket
export const JACKET = { nominal: 280, center: [0, -24] }
/** Local anchors on the jacket, used for hotspots. */
export const JACKET_ANCHORS = { hood: [0, -124], zip: [0, 34], pocket: [44, 64] }

export const jacket = ({ cx, cy, size, colour, accent = C.orange, rotate = 0 }) => {
  const edge = shade(colour, 0.2)
  const rib = shade(colour, 0.14)
  const sleeve = mirror2(
    path('M-58,-72 L-98,-62 L-124,50 L-122,98 L-90,102 L-86,48 L-62,-10 Z', colour, { strokeLinejoin: 'round' }) +
      path('M-123,84 L-88,88 L-90,102 L-122,98 Z', rib) +
      line(-84, -52, -106, 68, accent, 6) +
      line(-96, -58, -86, 46, edge, 2.5),
  )
  const body =
    path('M-64,-78 L64,-78 L68,104 Q68,112 60,112 L-60,112 Q-68,112 -68,104 Z', colour) +
    path('M-68,96 L68,96 L68,104 Q68,112 60,112 L-60,112 Q-68,112 -68,104 Z', rib) +
    rect(-66, -30, 132, 16, accent)
  const hood =
    path('M-62,-66 C-74,-126 -42,-156 0,-156 C42,-156 74,-126 62,-66 Q0,-36 -62,-66 Z', colour, { stroke: edge, strokeWidth: 3 }) +
    path('M0,-144 C-30,-144 -34,-118 -32,-98 C-30,-78 -14,-70 0,-70 C14,-70 30,-78 32,-98 C34,-118 30,-144 0,-144 Z', accent, {
      stroke: edge,
      strokeWidth: 4,
    })
  const zip =
    line(0, -68, 0, 112, C.grey2, 4, { strokeDasharray: '3 3', strokeLinecap: 'butt' }) +
    line(0, -68, 0, 112, edge, 1.5) +
    rect(-4, -74, 8, 18, accent, { rx: 3 })
  const pockets = mirror2(
    line(34, 30, 48, 90, C.cream, 3.5) + rect(40, 40, 5, 14, accent, { rx: 2, transform: 'rotate(-14 42 47)' }),
  )
  const parts = sleeve + body + hood + zip + pockets + cloud({ x: 34, y: -52, size: 28, colour: accent })
  return put({ cx, cy, size, rotate }, JACKET.nominal, parts, JACKET.center)
}

export const jacketAnchor = (placement, name) => toWorld(placement, JACKET.nominal, JACKET_ANCHORS[name], JACKET.center)

// ---------------------------------------------------------------- cap
export const CAP = { nominal: 276, center: [46, 0] }

/** Dad cap in side view: dome, panel seams, curved brim to the right, small patch on the front panel. */
export const cap = ({ cx, cy, size, colour, brim, patch = true, rotate = 0, flip = false }) => {
  const edge = shade(colour, 0.18)
  const brimColour = brim || shade(colour, 0.12)
  const brimShape =
    path('M66,33 C112,28 160,38 184,56 C156,76 106,68 66,44 Z', brimColour, { strokeLinejoin: 'round' }) +
    path('M72,48 C108,68 156,76 184,56', 'none', { stroke: shade(brimColour, 0.2), strokeWidth: 3, strokeLinecap: 'round' })
  const dome =
    path('M-80,34 C-84,-36 -44,-74 2,-74 C48,-74 82,-44 90,34 Z', colour, { strokeLinejoin: 'round' }) +
    path('M2,-74 C22,-40 26,0 24,34', 'none', { stroke: edge, strokeWidth: 2.5 }) +
    path('M2,-74 C-22,-40 -28,0 -28,34', 'none', { stroke: edge, strokeWidth: 2.5 }) +
    path('M2,-74 C-50,-50 -62,-8 -62,34', 'none', { stroke: edge, strokeWidth: 2.5 }) +
    line(-80, 27, 89, 27, edge, 3, { strokeLinecap: 'butt' }) +
    circle(2, -74, 7, brimColour) +
    rect(-94, 12, 16, 18, edge, { rx: 3 })
  const patchShape = patch
    ? rect(18, -38, 44, 34, C.cream, { rx: 8 }) + cloud({ x: 40, y: -20, size: 32, colour: C.orange })
    : ''
  return put({ cx, cy, size, rotate, flip }, CAP.nominal, brimShape + dome + patchShape, CAP.center)
}

// ---------------------------------------------------------------- socks
export const SOCKS = { nominal: 236, center: [-4, 0] }

const sock = ({ cuff, stripe, body, heel }) => {
  const shape = 'M-26,-100 L26,-100 L26,22 C26,30 32,34 40,36 L70,44 C90,50 98,64 98,78 C98,94 86,98 72,98 L-10,98 C-22,98 -28,90 -26,76 Z'
  const edge = shade(body, 0.12)
  return (
    path(shape, body, { strokeLinejoin: 'round' }) +
    path('M-26,52 L-26,76 C-26,90 -22,98 -10,98 L16,98 C16,78 4,60 -26,52 Z', heel) +
    path('M62,46 C90,50 98,64 98,78 C98,94 86,98 72,98 L66,98 C78,84 78,62 62,46 Z', heel) +
    rect(-26, -56, 52, 8, stripe) +
    rect(-26, -40, 52, 8, stripe) +
    rect(-26, -24, 52, 8, stripe) +
    path('M-26,-100 L26,-100 L26,-74 L-26,-74 Z', cuff) +
    [-14, -2, 10, 22].map((x) => line(x, -98, x, -76, edge, 2, { strokeLinecap: 'butt' })).join('')
  )
}

export const socks = ({ cx, cy, size, rotate = 0 }) => {
  const a = at(-90, -8, sock({ cuff: C.orange, stripe: C.orange, body: C.charcoal, heel: C.orange }), 1, -4)
  const b = at(14, 12, sock({ cuff: C.charcoal, stripe: C.charcoal, body: C.orange, heel: C.charcoal }), 1, 3)
  return put({ cx, cy, size, rotate }, SOCKS.nominal, a + b, SOCKS.center)
}

export { g }
