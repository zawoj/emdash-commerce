# @emdash-commerce/plugin-image-hotspots

## 0.2.0

### Minor Changes

- [#2](https://github.com/zawoj/emdash-commerce/pull/2) [`e0ab676`](https://github.com/zawoj/emdash-commerce/commit/e0ab676ddd5b82c24f0c9f7a70ead4363421ff4b) Thanks [@zawoj](https://github.com/zawoj)! - First public release of the commerce packages for EmDash, a community project that is not part of EmDash itself.

  - `@emdash-commerce/plugin-stripe` adds the `stripe-commerce` plugin: a catalog with product types, variants and prices, carts, Stripe Checkout, orders and signature-verified webhooks, plus an admin editor for products and orders.
  - `@emdash-commerce/plugin-image-hotspots` adds the `image-hotspots:hotspots` field widget for placing numbered points on an image, and `normaliseValue` to read the stored value on your site.
  - `@emdash-commerce/design-system` adds the design tokens and the props-driven Astro components used by the demo storefront.

  All three packages ship TypeScript and Astro source, like EmDash's own plugins, so Astro and Vite compile them in your site. See each package's README for installation and registration in `astro.config.mjs`.
