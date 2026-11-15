// Hotspot centres as percentages (0-100) of the image width/height, derived from the layout
// constants the scenes draw with (see layouts.mjs).
import { lookDeskPoints, spotlightPoints } from './layouts.mjs'

export const HOTSPOTS = {
  lookDesk: lookDeskPoints(),
  spotlightJacket: spotlightPoints(),
}
