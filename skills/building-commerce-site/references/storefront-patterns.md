# Storefront patterns (`apps/storefront`)

## Routes (commerce)

| Path | Notes |
| --- | --- |
| `/shop`, `/shop/[slug]` | Listing uses facets in `features/catalog/domain/facets.ts` (server + client share one function) |
| `/shop/c/[slug]`, `/shop/brand/[slug]` | 301 into `/shop?category=` / `?brand=`; unknown slug → 404 |
| `/cart` | Design-system cart; `data-testid="cart-checkout"` |
| `/checkout/success` | Polls checkout status; order number hook for e2e |
| `/orders/view` | Signed token; `no-store`, `noindex`, no referrer |
| `/orders/lookup` | POST to `api/orders/access-link` |

## Features layout

```
src/features/
  catalog/   # listing, PDP, AddToCart, facets
  cart/      # cart page, mini-cart client, look-cart kit dialog
  checkout/  # success page client status poll
  orders/    # view model from plugin API
  home/      # rails, look hotspots, spotlight
  shell/     # header, copy en/pl
```

## Design system

All visual components from `@emdash-commerce/design-system`. Copy passed as props from `features/*/copy.ts`.

Token changes: `packages/design-system/src/tokens/` + `pnpm nx test design-system` (token-lint + contrast).

## Image hotspots

Field `image-hotspots:hotspots` on `home.look_hotspots` and `home.spotlight_callouts`. Widget is React admin entry —
keep `@emdash-cms/admin` alias in `astro.config.mjs`.

## Imports

```ts
// Allowed
import { … } from "@emdash-commerce/plugin-stripe/contracts";

// Forbidden in storefront
import … from "../../../packages/plugin-stripe/src/…";
```

## Locale

English or Polish per deployment default locale — not per-request switching in the demo.