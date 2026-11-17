---
name: mini-cart-repeats-the-cart-line-test-id
description: the header's mini-cart dialog renders the same cart-line component (data-testid cart-line, quantity stepper) a moment after load, so cart-page locators must be scoped to main or they match twice
metadata:
  type: feedback
---

# A cart locator on the whole page finds the mini-cart too

`GET /api/cart/summary?html=1` fills a `<dialog>` in the header with the same `CartLine` markup the cart page uses, so
`getByTestId("cart-line")` is 1 right after `goto("/cart")` and 2 a few hundred milliseconds later (a flaky `toHaveCount(1)`
and a strict-mode violation on `[data-quantity-step]`). Scope the cart page's locators to `page.getByRole("main")`. The same
fragment is why the header badge is read through `[data-count-bubble]`: its spoken text for one item is "1 items in the cart".
