# Rebuild cart, checkout success, order lookup

## Goal
Replace legacy `/cart` and `/checkout/success` with design-system pages, add `/orders/lookup`, and stable `data-testid` hooks for e2e.

## Steps
- Cart: `features/cart/view-model.ts`, `CartPageFragment.astro`, `/api/cart/fragment`, `cart-page.client.ts`; en/pl copy in `features/cart/copy.ts`.
- Checkout success: `features/checkout/` + `OrderConfirmation` with polling via DOM text updates.
- Order lookup: `pages/orders/lookup.astro`, `api/orders/access-link.ts`, link from invalid `/orders/view`.
- Design-system: `data-testid` on `CartLine`, optional test ids on `OrderSummary` rows and `OrderConfirmation`.

## Verification
- `pnpm check:ai`, `pnpm typecheck`, `pnpm test`, `pnpm build` green.
- Seeded on `4371`; Playwright screenshots under `.ai/scratch/screenshots/`.
- Mutation: changing `cart-subtotal` test id in `view-model.ts` fails `cart/view-model.test.ts` (restored).

## Outcome
Storefront commerce pages use the design system; behavior preserved (line actions, checkout POST, cart events, checkout notices).

## Follow-ups
- Parent PR should add root `CHANGELOG.md` entry (agent did not edit root changelog per brief).