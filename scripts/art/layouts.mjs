// Placements shared by the scenes (which draw them) and hotspots.mjs (which reads them back),
// so a hotspot is always computed from the coordinates the drawing uses.
import { toWorld } from './svg.mjs'
import { LAMP, MAT, CABLES, KEYCAPS } from './shapes/desk.mjs'
import { MUG as MUG_SHAPE } from './shapes/drinkware.mjs'
import { JACKET, JACKET_ANCHORS } from './shapes/apparel.mjs'

export const LOOK_DESK = {
  w: 1200,
  h: 1500,
  deskTop: 1000,
  lamp: { cx: 270, cy: 753, size: 640 },
  mat: { cx: 620, cy: 1160, size: 540 },
  mug: { cx: 1000, cy: 981, size: 300 },
  cables: { cx: 360, cy: 1350, size: 240 },
  keycaps: { cx: 800, cy: 1385, size: 300 },
}

/** Local anchor (in each shape's own space) that the numbered hotspot marker sits on. */
export const LOOK_DESK_ANCHORS = {
  lamp: [44, -40],
  deskMat: [0, 0],
  mug: [0, 5],
  cableKit: [20, 30],
  keycaps: [0, 0],
}

export const SPOTLIGHT = { w: 1200, h: 1500, jacket: { cx: 600, cy: 720, size: 1000 } }

const pct = (value, total) => Number(((value / total) * 100).toFixed(1))

export const toPercent = ({ x, y }, w, h) => ({ x: pct(x, w), y: pct(y, h) })

export const lookDeskPoints = () => {
  const d = LOOK_DESK
  const at = (placement, shape, anchor) => toPercent(toWorld(placement, shape.nominal, anchor, shape.center), d.w, d.h)
  return {
    lamp: at(d.lamp, LAMP, LOOK_DESK_ANCHORS.lamp),
    deskMat: at(d.mat, MAT, LOOK_DESK_ANCHORS.deskMat),
    mug: at(d.mug, MUG_SHAPE, LOOK_DESK_ANCHORS.mug),
    cableKit: at(d.cables, CABLES, LOOK_DESK_ANCHORS.cableKit),
    keycaps: at(d.keycaps, KEYCAPS, LOOK_DESK_ANCHORS.keycaps),
  }
}

export const spotlightPoints = () => {
  const s = SPOTLIGHT
  const at = (name) => toPercent(toWorld(s.jacket, JACKET.nominal, JACKET_ANCHORS[name], JACKET.center), s.w, s.h)
  return { hood: at('hood'), zip: at('zip'), pocket: at('pocket') }
}

