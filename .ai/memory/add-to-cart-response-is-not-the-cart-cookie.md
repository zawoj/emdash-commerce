---
name: add-to-cart-response-is-not-the-cart-cookie
description: the plugin's cart/lines answer arrives before the storefront has stored the new cart's cookie; a page.goto("/cart") right after it showed an empty cart on workerd, so e2e helpers wait for the header bubble
metadata:
  type: project
---

# The add-to-cart response is not the end of adding to the cart

`addPriceToCart` (apps/storefront/src/utils/add-to-cart.ts) posts the line to the plugin, and only then, for a new cart, posts the
cart id to `/api/cart-cookie` (plugin routes cannot set cookies) and announces the change (the header bubble updates).
`e2e/support/cart.ts` used to return as soon as the `cart/lines` response arrived, so `page.goto("/cart")` could beat the cookie
and render "Your cart is empty". On Node the cookie call is fast enough to win; on workerd (slower answers) the second
`cart.spec.ts` test failed every time. A latent race on Node, exposed by the Cloudflare run (2026-11-17).

**How to apply:** after the click wait for `[data-count-bubble]` in the banner to show a count (`addToCartFromProductPage` does);
do not treat the plugin's response as "the cart exists for the next navigation".
