// Drinkware: ceramic mug, steel bottle, tumbler with lid and straw.
import { C } from '../palette.mjs'
import { circle, ellipse, line, path, put, rect, shade, mix } from '../svg.mjs'

export const MUG = { nominal: 176, center: [22, 0] }

/** `decor` is an SVG fragment in mug-local coordinates (body is x -60..60, y -60..70). */
export const mug = ({ cx, cy, size, colour = C.white, decor = '', rotate = 0 }) => {
  const edge = shade(colour, 0.16)
  const handle = path('M57,-36 C106,-40 104,34 52,32', 'none', { stroke: colour, strokeWidth: 15, strokeLinecap: 'round' })
  const handleEdge = path('M57,-36 C106,-40 104,34 52,32', 'none', { stroke: edge, strokeWidth: 19, strokeLinecap: 'round' })
  const body = path('M-60,-60 L60,-60 L56,60 Q56,70 46,70 L-46,70 Q-56,70 -56,60 Z', colour, { strokeLinejoin: 'round' })
  const rim = ellipse(0, -60, 60, 11, edge) + ellipse(0, -59, 53, 8, mix(colour, C.ink, 0.5))
  const hi = rect(-48, -42, 8, 92, mix(colour, C.white, 0.5), { rx: 4 })
  return put({ cx, cy, size, rotate }, MUG.nominal, handleEdge + handle + body + hi + rim + decor, MUG.center)
}

export const BOTTLE = { nominal: 290, center: [0, -13] }

export const bottle = ({ cx, cy, size, colour = C.grey2, capColour = C.charcoal, band = C.orange, decor = '', rotate = 0 }) => {
  const edge = shade(colour, 0.16)
  const body = path(
    'M-26,-112 L26,-112 L26,-98 C40,-90 40,-80 40,-60 L40,112 Q40,124 28,124 L-28,124 Q-40,124 -40,112 L-40,-60 C-40,-80 -40,-90 -26,-98 Z',
    colour,
    { strokeLinejoin: 'round' },
  )
  const hi = rect(-32, -52, 8, 150, mix(colour, C.white, 0.5), { rx: 4 })
  const stripe = rect(-40, 84, 80, 14, band)
  const capShape =
    rect(-26, -148, 52, 38, capColour, { rx: 8 }) +
    [-14, -4, 6, 16].map((x) => line(x, -142, x, -116, mix(capColour, C.white, 0.18), 2.5, { strokeLinecap: 'butt' })).join('') +
    path('M12,-148 C12,-166 38,-166 38,-148', 'none', { stroke: capColour, strokeWidth: 7, strokeLinecap: 'round' })
  const seam = line(-26, -98, 26, -98, edge, 2.5)
  return put({ cx, cy, size, rotate }, BOTTLE.nominal, body + hi + stripe + seam + capShape + decor, BOTTLE.center)
}

export const TUMBLER = { nominal: 260, center: [0, -25] }

export const tumbler = ({ cx, cy, size, colour = C.orange, lid = C.charcoal, straw = C.amber, decor = '', rotate = 0 }) => {
  const body = path('M-52,-72 L52,-72 L38,90 Q36,100 26,100 L-26,100 Q-36,100 -38,90 Z', colour, { strokeLinejoin: 'round' })
  const hi = path('M-40,-60 L-34,-60 L-26,88 L-30,88 Z', mix(colour, C.white, 0.4))
  const band = path('M-50,-40 L50,-40 L49,-28 L-49,-28 Z', shade(colour, 0.2))
  const strawShape = line(14, -104, 38, -156, straw, 9) + circle(38, -156, 4.5, mix(straw, C.white, 0.35))
  const lidShape =
    path('M-46,-80 C-44,-108 44,-108 46,-80 Z', lid) + rect(-56, -84, 112, 16, lid, { rx: 8 }) + rect(-56, -80, 112, 4, mix(lid, C.white, 0.15))
  return put({ cx, cy, size, rotate }, TUMBLER.nominal, strawShape + body + hi + band + lidShape + decor, TUMBLER.center)
}
