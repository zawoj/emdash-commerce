# stripe-commerce HTTP API (reference)

Source of truth: `packages/plugin-stripe/src/contracts/api.ts`, `docs/api.md`.

## Envelope and errors

- Success: `200` + `{ "data": … }`.
- Failure: real HTTP status + `{ "error": { "code", "message", "details?" } }`.
- Plugin throws `PluginRouteError` so EmDash does not turn errors into HTTP 200.

Common codes: `CART_NOT_CHECKOUT_READY`, `INSUFFICIENT_STOCK`, `NOT_CONFIGURED` (no key / bad site URL / webhook),
`UNAUTHORIZED` (bad order token), `RATE_LIMITED`.

## Cart

Identity: 32-char base64url `cartId`; header `x-commerce-cart` preferred.

`GET cart` never persists: unknown id → fresh cart (`isNew: true`, new `cartId`). Always persist the latest `cartId` from
responses.

## Checkout

`POST checkout` with optional `email`, `successUrl`, `cancelUrl`. Server builds Stripe Checkout Session from priced cart.
Double submit returns the same open session when still valid.

## Orders (guest)

- `GET orders/view?token=` — HMAC token; never cache; demo at `apps/storefront/src/pages/orders/view.astro`.
- `POST orders/access-link` — email + order number; always same response shape (no enumeration); demo form at
  `/orders/lookup`.

Access token secret: `COMMERCE_ACCESS_TOKEN_SECRET` or generated encrypted when encryption key is set.

## Admin and MCP

Private routes need EmDash permissions (`plugins:manage`, `content:edit_any`). Nineteen MCP tools mirror Commerce
operations (`commerce_status`, `commerce_catalog_sync`, `commerce_orders_list`, …) — table in `packages/plugin-stripe/README.md`.

## Contracts import

```ts
import { cartViewSchema, type CartView } from "@emdash-commerce/plugin-stripe/contracts";
```

Never import from `packages/plugin-stripe/src` in the storefront — use package `exports` only (`AGENTS.md` invariant).