// The full asset list: file name, pixel size and the function that draws the SVG string.
import { productEntries } from './products.mjs'
import { sceneEntries } from './scenes.mjs'

export const MANIFEST = [...productEntries(), ...sceneEntries()]
