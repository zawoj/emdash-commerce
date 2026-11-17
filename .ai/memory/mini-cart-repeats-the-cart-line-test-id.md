---
name: mini-cart-repeats-the-cart-line-test-id
description: the header's mini-cart dialog renders the same cart-line component (data-testid cart-line, quantity stepper) a moment after load, so cart-page locators must be scoped to main or they match twice
metadata:
  type: feedback
---

# A cart locator on the whole page finds the mini-cart too

`GET /api/cart/summary?html=1` fills a `<dialog>` in the header with the same `CartLine` markup the cart page uses, so
`getByTestId("cart-line")` is 1 right after `goto("/cart")` and 2 a few hundred milliseconds later (a flaky `toHaveCount(1)`
and a strict-mode violation on `[data-quantity-step]`). Scope the cart page's locators to `page.getByRole("main")`. The header
badge is read through `[data-count-bubble]` (the visible number); its spoken text is a plural form ("1 item in the cart") in
`[data-count-spoken]`. The cart link's own accessible name is just "Cart" (a `role=status` child does not feed it) and the
badge's `textContent` joins the bubble and the spoken text ("11 item in the cart"), so assert the spoken text through `[data-count-spoken]`.
