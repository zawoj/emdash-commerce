// Tiny SVG string helpers: elements, transforms and flat colour maths.
const kebab = (key) => key.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)

export const n = (value) => Number(Number(value).toFixed(2))

const attrs = (o = {}) =>
  Object.entries(o)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => `${kebab(k)}="${typeof v === 'number' ? n(v) : v}"`)
    .join(' ')

const tag = (name, a, children) =>
  children === undefined ? `<${name} ${attrs(a)}/>` : `<${name} ${attrs(a)}>${children}</${name}>`

export const rect = (x, y, w, h, fill, o = {}) => tag('rect', { x, y, width: w, height: h, fill, ...o })
export const circle = (cx, cy, r, fill, o = {}) => tag('circle', { cx, cy, r, fill, ...o })
export const ellipse = (cx, cy, rx, ry, fill, o = {}) => tag('ellipse', { cx, cy, rx, ry, fill, ...o })
export const path = (d, fill, o = {}) => tag('path', { d, fill, ...o })
export const line = (x1, y1, x2, y2, stroke, w, o = {}) =>
  tag('line', { x1, y1, x2, y2, stroke, strokeWidth: w, strokeLinecap: 'round', ...o })
export const poly = (points, fill, o = {}) =>
  tag('polygon', { points: points.map(([x, y]) => `${n(x)},${n(y)}`).join(' '), fill, ...o })
export const polyline = (points, stroke, w, o = {}) =>
  tag('polyline', {
    points: points.map(([x, y]) => `${n(x)},${n(y)}`).join(' '),
    fill: 'none',
    stroke,
    strokeWidth: w,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    ...o,
  })
export const g = (children, o = {}) => tag('g', o, children)

export const mirror = (inner) => g(inner, { transform: 'scale(-1 1)' })
export const at = (x, y, inner, scale = 1, rotate = 0) =>
  g(inner, { transform: `translate(${n(x)} ${n(y)}) rotate(${n(rotate)}) scale(${n(scale)})` })

/**
 * Places a shape drawn in its own local space.
 * `nominal` is the local size that maps to `size` pixels, `center` is the local
 * point that lands on (cx, cy).
 */
export const put = ({ cx, cy, size, rotate = 0, flip = false }, nominal, inner, center = [0, 0]) => {
  const s = size / nominal
  const sx = flip ? -s : s
  return g(inner, {
    transform: `translate(${n(cx)} ${n(cy)}) rotate(${n(rotate)}) scale(${n(sx)} ${n(s)}) translate(${n(-center[0])} ${n(-center[1])})`,
  })
}

/** World position of a local point, so hotspots come from the same coordinates the drawing uses. */
export const toWorld = ({ cx, cy, size, rotate = 0, flip = false }, nominal, [lx, ly], center = [0, 0]) => {
  const s = size / nominal
  const dx = (lx - center[0]) * s * (flip ? -1 : 1)
  const dy = (ly - center[1]) * s
  const a = (rotate * Math.PI) / 180
  return { x: cx + dx * Math.cos(a) - dy * Math.sin(a), y: cy + dx * Math.sin(a) + dy * Math.cos(a) }
}

const toRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
const toHex = (rgb) => `#${rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`

export const mix = (a, b, t) => {
  const ra = toRgb(a)
  const rb = toRgb(b)
  return toHex(ra.map((v, i) => v + (rb[i] - v) * t))
}

export const lum = (hex) => {
  const [r, g2, b] = toRgb(hex)
  return (0.2126 * r + 0.7152 * g2 + 0.0722 * b) / 255
}

/** A flat tint of `colour` that stays visible on it: darker on light colours, lighter on dark ones. */
export const shade = (colour, t = 0.14) => (lum(colour) > 0.4 ? mix(colour, '#000000', t) : mix(colour, '#FFFFFF', t * 0.7))

/** Flat darker version of a background, for ground shadows. */
export const groundShadow = (bg, t = 0.1) => (lum(bg) < 0.35 ? mix(bg, '#000000', 0.5) : mix(bg, '#000000', t))

export const shadowEllipse = (cx, cy, rx, ry, bg, t = 0.1) => ellipse(cx, cy, rx, ry, groundShadow(bg, t))

export const canvas = (w, h, bg, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
  rect(0, 0, w, h, bg) +
  inner +
  '</svg>'
