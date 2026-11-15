---
name: emdash-plugin-stripe-cookies
description: plugin routes cannot set cookies, so the storefront stores the cart id; the plugin reads it from the x-commerce-cart header or the emdash_commerce_cart cookie
---

# EmDash Stripe plugin — cart identity and cookies

Native plugin routes return JSON or `pluginResponse()` with an **allowlisted** header set (`content-type`,
`cache-control`, ...). **`Set-Cookie` is not allowlisted**, so cart routes cannot set a cookie themselves.

The cart id is a bearer secret (24 random bytes, 32 base64url characters, `CART_ID_PATTERN`); the server chooses it.
The plugin reads it from the **`x-commerce-cart` header** first, then the **`emdash_commerce_cart` cookie**
(`CART_HEADER`, `CART_COOKIE` from `@emdash-commerce/plugin-stripe`); a malformed value counts as "no cart", never an
error. The storefront stores the `cartId` of every cart response itself. `apps/storefront` does it with an httpOnly cookie
set by its own same-origin server route (`src/pages/api/cart-cookie.ts`: same-origin check, id validated with
`CART_ID_PATTERN` from `./contracts`), and browser fetches send `credentials: "include"`.

`GET cart` never persists; the cart is created on the first `cart/lines` write. Contract and details:
`packages/plugin-stripe/docs/api.md` ("Cart identity"). Before 0.2 the cookie was `emdash_stripe_cart_id`
(`CART_COOKIE_NAME`, `isValidCartId`): those names are gone. Related: [[emdash-plugin-stripe-extending]].
