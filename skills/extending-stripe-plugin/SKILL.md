---
name: extending-stripe-plugin
description: Extend or modify @emdash-commerce/plugin-stripe using its layered architecture, extension subscribers, validateCart and email renderers, route and MCP seams, invariants, and Vitest testing helpers. Use when changing packages/plugin-stripe; use building-commerce-site for storefront wiring only.
---

# Extending the Stripe commerce plugin

Package: `packages/plugin-stripe` · plugin id: **`stripe-commerce`** · community native plugin (not sandboxed registry).

Read **`packages/plugin-stripe/docs/extending.md`** and **`.ai/memory/emdash-plugin-stripe-extending.md`** before editing.

## Layer map

```
plugin/          EmDash definePlugin, routes, hooks, cron, MCP, admin page, container
adapters/        emdash content + storage + schema · stripe SDK (only importers)
services/        use cases (cart, checkout, settlement, catalog sync, …)
ports/           interfaces (PaymentProvider, repositories, Clock, Mailer, …)
core/            pure domain (money, cart pricing, order machine, events, errors)
contracts/       options, HTTP zod, extension API (importable by storefronts)
testing/         in-memory world, fakes, Stripe fixtures
```

**Rule:** import only downward. Known upward leaks are documented in `docs/architecture.md` — tighten carefully.

Web Crypto only (no `node:crypto`). Stripe client uses `fetch` + `SubtleCrypto` for webhooks — must stay workerd-safe
(`.ai/memory/plugin-stripe-runs-on-workerd.md`).

## Extension seams (site-level)

Sites pass a second argument to `createStripeCommercePlugin(options, extensions)` via a **custom plugin entrypoint**
(re-export wrapper in the site's repo).

| Seam | Use for |
| --- | --- |
| `subscribers` | React to domain events (`order.paid`, `cart.abandoned`, `inventory.low_stock`, …) via outbox |
| `validateCart` | Extra cart rules before checkout |
| `customizeCheckout` | Adjust Stripe session params |
| `emailRenderers` | Replace HTML for transactional mail |
| Site-owned `createPlugin` entry | Wire the above without forking the package |

Subscribers are **durable** (outbox + per-subscriber delivery). Idempotency keys for Stripe must derive from record ids,
never random — `.ai/memory/emdash-plugin-stripe-idempotency.md`.

Cannot put functions in JSON `options` in `astro.config.mjs`; use a custom entrypoint module instead.

## Invariants (do not break)

- Payment state comes from **webhook/reconciliation**, never the browser.
- **Never write `products` collection** from the plugin autonomously (draft staging).
- **Catalog mirrors one way** to Stripe; dashboard drift is reported, not imported.
- **Cart amounts** computed server-side; client sends price ids + quantities.
- Route errors must **throw** `PluginRouteError` (`runRoute` in `plugin/http.ts`) — returning error objects → HTTP 200.
- **Guest customers only** — email-keyed; signed order links for access.
- **Webhook:** verify raw body, constant-time compare, inbox dedupe by event id.

## Changing the package

1. Prefer the **smallest layer** that can own the behaviour (core rule → services → adapter).
2. Add or extend **ports** before touching Stripe or EmDash adapters.
3. Boundary validation with zod in `contracts/` and route handlers.
4. **Tests:** unit on core/services; route tests with `createFakeRouteContext`; adapter contract tests with
   `createInMemoryWorld()` and `real-host/*.real.test.ts` against SQLite EmDash.

See **[references/layers-and-seams.md](references/layers-and-seams.md)** and **[references/testing.md](references/testing.md)**.

## Admin and MCP

- Block Kit Commerce page: `plugin/admin-page/`.
- MCP tools: `plugin/mcp.ts` — keep in sync with README tool table (19 tools).
- Content-policy hook: product publish guard.

Schema reconciler on upgrade: `adapters/emdash/schema/` — additive; never drop editor customisations.

## Traps (read before debugging)

| Trap | Memory |
| --- | --- |
| Webhook 200 on thrown errors if not using `runRoute` | `emdash-plugin-stripe-webhook-traps.md` |
| Abandoned checkout leftovers | `emdash-plugin-stripe-abandoned-checkout-leftovers.md` |
| Admin `carts` mirror vs storage authority | `emdash-plugin-stripe-admin-carts.md` |
| Resync slowness | `emdash-plugin-stripe-resync-is-slow-by-design.md` |

Full index: `.ai/memory/MEMORY.md`.

Package gate: `pnpm --filter @emdash-commerce/plugin-stripe test` and `typecheck`.

Storefront must keep importing only **`@emdash-commerce/plugin-stripe` exports** (`/contracts`, `/astro`, `/testing`).