---
name: emdash-media-upload-rejects-svg
description: EmDash's media upload allowlist excludes image/svg+xml, so seeded or generated art must be PNG/JPEG/WebP - this is why the mock product art is rasterised PNG
---

# EmDash media uploads reject SVG

`media-allowlist` in `emdash` (1.5) lists `image/png`, `jpeg`, `gif`, `webp`, `avif`, `bmp`, `jxl`, video, audio and PDF; it
leaves out `image/svg+xml` on purpose (no upload-time validation, so an SVG could carry a `<script>`). A field can opt in
through its own `allowedMimeTypes`, which we do not do.

- Consequence (read from the allowlist code, the upload itself was not exercised): the seed cannot upload vector art. `scripts/art/` renders to PNG
  with `sharp` and commits the PNGs to `apps/storefront/public/merch/`.
- Static files in `public/` are not subject to the allowlist, but anything that must live in the media library
  (product, variant, category and home images) has to be a raster format.
- Do not "fix" it by widening the allowlist for the shop; regenerate the art as PNG instead.
