/**
 * `@emdash-commerce/plugin-image-hotspots`: a field widget (`image-hotspots:hotspots`) that edits an image
 * with numbered points on it. Register it in the `plugins` array of `emdash()` (see the README) and read a
 * stored value on the site with `normaliseValue` from `@emdash-commerce/plugin-image-hotspots/value`.
 */
export { createPlugin, createImageHotspotsPlugin, ADMIN_ENTRY } from "./plugin.js";
export * from "./value/index.js";
