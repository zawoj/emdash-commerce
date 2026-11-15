// Original brand-free glyphs: cloud, shield, bracket, node network, dotted globe, lightning, starburst.
// Every glyph is drawn in a 100-unit box centred on the origin and placed with { x, y, size }.
import { C } from '../palette.mjs'
import { at, circle, g, line, path, poly, polyline, rect, mirror } from '../svg.mjs'

const N = 100

export const cloud = ({ x, y, size, colour = C.orange, depth }) => {
  const body = (fill) =>
    rect(-50, -2, 100, 34, fill, { rx: 17 }) + circle(-24, -4, 20, fill) + circle(4, -16, 27, fill) + circle(30, -2, 17, fill)
  const inner = (depth ? at(3, 3.5, body(depth)) : '') + body(colour)
  return at(x, y + 0, g(inner, { transform: 'translate(0 5.5)' }), size / N)
}

export const shield = ({ x, y, size, colour = C.charcoal, accent = C.orange, crack, keyhole = true }) => {
  const outline = 'M0,-50 L38,-36 V4 C38,28 18,44 0,52 C-18,44 -38,28 -38,4 V-36 Z'
  const hole = keyhole ? circle(0, -8, 9, accent) + path('M-5,-2 L5,-2 L9,22 L-9,22 Z', accent) : ''
  const cr = crack ? polyline([[8, -52], [-5, -30], [9, -12], [-6, 8], [5, 30], [-2, 54]], crack, 4.5) : ''
  return at(x, y, path(outline, colour, { strokeLinejoin: 'round' }) + hole + cr, size / N)
}

export const bracket = ({ x, y, size, colour = C.orange, sw = 9 }) => {
  const brace = path('M12,-46 C-2,-46 -6,-38 -6,-26 V-12 C-6,-4 -12,0 -22,0 C-12,0 -6,4 -6,12 V26 C-6,38 -2,46 12,46', 'none', {
    stroke: colour,
    strokeWidth: sw,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  })
  return at(x, y, at(-24, 0, brace) + at(24, 0, mirror(brace)), size / N)
}

const NODES = [[-42, -28], [-6, -40], [38, -30], [-18, 8], [30, 12], [-38, 42], [10, 44]]
const EDGES = [[0, 1], [1, 2], [0, 3], [1, 3], [1, 4], [2, 4], [3, 4], [3, 5], [3, 6], [4, 6], [5, 6]]

export const nodes = ({ x, y, size, colour = C.orange, lines = C.grey3, accent = C.amber, lineWidth = 3.5 }) => {
  const edges = EDGES.map(([a, b]) => line(...NODES[a], ...NODES[b], lines, lineWidth)).join('')
  const dots = NODES.map(([nx, ny], i) => circle(nx, ny, i % 3 === 0 ? 9 : 7, i % 3 === 0 ? accent : colour)).join('')
  return at(x, y, edges + dots, size / N)
}

export const globe = ({ x, y, size, colour = C.orange, dim = C.grey3 }) => {
  const dots = []
  for (let gy = -48; gy <= 48; gy += 8) {
    for (let gx = -48; gx <= 48; gx += 8) {
      if (Math.hypot(gx, gy) > 49) continue
      const isLand = Math.sin(gx * 0.13 + 1) + Math.cos(gy * 0.17 - gx * 0.05) > 0.3
      dots.push(circle(gx, gy, isLand ? 3.6 : 2, isLand ? colour : dim))
    }
  }
  return at(x, y, dots.join(''), size / N)
}

export const lightning = ({ x, y, size, colour = C.amber }) =>
  at(x, y, poly([[12, -50], [-26, 6], [-3, 6], [-14, 50], [28, -10], [4, -10]], colour, { strokeLinejoin: 'round' }), size / N)

export const starburst = ({ x, y, size, colour = C.orange, points = 12, inner = 0.8, stroke, strokeWidth = 0, rotate = 0 }) => {
  const pts = []
  for (let i = 0; i < points * 2; i += 1) {
    const r = i % 2 === 0 ? 50 : 50 * inner
    const a = (Math.PI * i) / points - Math.PI / 2
    pts.push([r * Math.cos(a), r * Math.sin(a)])
  }
  const o = stroke ? { stroke, strokeWidth, strokeLinejoin: 'round' } : {}
  return at(x, y, poly(pts, colour, o), size / N, rotate)
}

export const hexagon = ({ x, y, size, colour = C.orange, stroke, strokeWidth = 0 }) => {
  const pts = [0, 1, 2, 3, 4, 5].map((i) => [48 * Math.cos((Math.PI / 3) * i - Math.PI / 6), 48 * Math.sin((Math.PI / 3) * i - Math.PI / 6)])
  const o = stroke ? { stroke, strokeWidth, strokeLinejoin: 'round' } : {}
  return at(x, y, poly(pts, colour, o), size / N)
}
